import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

let scouts = [];
let attendanceRecords = [];
let noteRecords = [];

const scoutSelect = document.getElementById("reportScoutSelect");
const reportDate = document.getElementById("reportDate");
const byScoutTab = document.getElementById("byScoutTab");
const byDateTab = document.getElementById("byDateTab");

reportDate.value = getToday();

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("login.html");
});

byScoutTab.addEventListener("click", () => selectReportTab("scout"));
byDateTab.addEventListener("click", () => selectReportTab("date"));
scoutSelect.addEventListener("change", renderScoutReport);
reportDate.addEventListener("change", renderDateReport);
document.getElementById("printReportBtn").addEventListener("click", printCurrentReport);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("login.html");
    return;
  }

  try {
    const profileSnapshot = await getDoc(doc(db, "users", user.uid));

    if (!profileSnapshot.exists()) {
      throw new Error("Your account profile could not be found.");
    }

    const profile = profileSnapshot.data();

    if (profile.role !== "leader" || profile.status !== "active") {
      window.location.replace("dashboard.html");
      return;
    }

    document.getElementById("welcome").textContent = `Prepared by ${profile.name}, Adult Leader`;
    startReportListeners();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

function startReportListeners() {
  onSnapshot(
    query(collection(db, "users"), where("role", "==", "scout")),
    (snapshot) => {
      const selectedScout = scoutSelect.value;
      scouts = snapshot.docs
        .map((item) => ({ uid: item.id, ...item.data() }))
        .sort((a, b) => a.name.localeCompare(b.name));
      populateScoutSelect(selectedScout);
      renderReports();
    },
    handleSnapshotError
  );

  onSnapshot(
    collection(db, "attendance"),
    (snapshot) => {
      attendanceRecords = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderReports();
    },
    handleSnapshotError
  );

  onSnapshot(
    collection(db, "scoutNotes"),
    (snapshot) => {
      noteRecords = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderReports();
    },
    handleSnapshotError
  );
}

function populateScoutSelect(previousSelection) {
  scoutSelect.innerHTML = '<option value="">Select a Scout</option>';

  scouts.forEach((scout) => {
    const option = document.createElement("option");
    option.value = scout.uid;
    option.textContent = `${scout.name} (${scout.scoutId})${scout.status === "inactive" ? " — Archived" : ""}`;
    scoutSelect.appendChild(option);
  });

  if (scouts.some((scout) => scout.uid === previousSelection)) {
    scoutSelect.value = previousSelection;
  }
}

function selectReportTab(reportType) {
  const showScoutReport = reportType === "scout";

  document.getElementById("byScoutReport").hidden = !showScoutReport;
  document.getElementById("byDateReport").hidden = showScoutReport;
  byScoutTab.classList.toggle("active", showScoutReport);
  byDateTab.classList.toggle("active", !showScoutReport);
  byScoutTab.setAttribute("aria-selected", String(showScoutReport));
  byDateTab.setAttribute("aria-selected", String(!showScoutReport));
}

function renderReports() {
  renderScoutReport();
  renderDateReport();
}

function renderScoutReport() {
  const tableBody = document.getElementById("scoutReportBody");
  const emptyState = document.getElementById("emptyScoutReport");
  const scout = scouts.find((item) => item.uid === scoutSelect.value);
  tableBody.innerHTML = "";

  if (!scout) {
    document.getElementById("scoutReportTitle").textContent = "Scout attendance";
    document.getElementById("scoutReportSummary").textContent = "Select a Scout to view every date they were present.";
    emptyState.textContent = "Select a Scout to produce a report.";
    emptyState.hidden = false;
    return;
  }

  const presentRecords = Array.from(
    new Map(
      attendanceRecords
        .filter((record) => record.scoutUid === scout.uid && record.status === "Present")
        .map((record) => [record.date, record])
    ).values()
  ).sort((a, b) => b.date.localeCompare(a.date));

  document.getElementById("scoutReportTitle").textContent = `${scout.name} — ${scout.scoutId}`;
  document.getElementById("scoutReportSummary").textContent = `${presentRecords.length} total day${presentRecords.length === 1 ? "" : "s"} present.`;
  emptyState.textContent = `${scout.name} has no present attendance records.`;
  emptyState.hidden = presentRecords.length > 0;

  presentRecords.forEach((record) => {
    const note = findNote(record.scoutUid, record.date);
    appendRow(tableBody, [
      formatDate(record.date),
      formatMarker(record),
      formatNote(note),
    ]);
  });
}

function renderDateReport() {
  const tableBody = document.getElementById("dateReportBody");
  const emptyState = document.getElementById("emptyDateReport");
  const selectedDate = reportDate.value || getToday();
  let presentCount = 0;
  tableBody.innerHTML = "";

  scouts.forEach((scout) => {
    const attendance = attendanceRecords.find(
      (record) => record.scoutUid === scout.uid && record.date === selectedDate
    );
    const isPresent = attendance?.status === "Present";
    const note = findNote(scout.uid, selectedDate);

    if (isPresent) {
      presentCount += 1;
    }

    appendRow(tableBody, [
      `${scout.name}${scout.status === "inactive" ? " (Archived)" : ""}`,
      scout.scoutId,
      isPresent ? "Present" : "Not present",
      isPresent ? formatMarker(attendance) : "—",
      formatNote(note),
    ], isPresent ? "present-report-row" : "absent-report-row");
  });

  document.getElementById("dateReportTitle").textContent = `Daily attendance — ${formatDate(selectedDate)}`;
  document.getElementById("dateReportSummary").textContent = `${presentCount} of ${scouts.length} Scouts present.`;
  emptyState.hidden = scouts.length > 0;
}

function appendRow(tableBody, values, className = "") {
  const row = document.createElement("tr");
  row.className = className;

  values.forEach((value, index) => {
    const cell = document.createElement("td");
    cell.textContent = value;
    if (index === values.length - 1) {
      cell.className = "note-cell";
    }
    row.appendChild(cell);
  });

  tableBody.appendChild(row);
}

function findNote(scoutUid, date) {
  return noteRecords.find((note) => note.scoutUid === scoutUid && note.date === date);
}

function formatNote(note) {
  if (!note) {
    return "—";
  }

  const labels = {
    sick: "Out sick",
    "left-early": "Left early",
    other: "Other",
  };
  const label = labels[note.type] || "Other";
  return note.note ? `${label}: ${note.note}` : label;
}

function formatMarker(record) {
  const role = record.markedByRole === "leader" ? "Adult Leader" : "Scout";
  return `${record.markedByName} (${role})`;
}

function formatDate(date) {
  const [year, month, day] = date.split("-");
  return `${month}/${day}/${year}`;
}

function getToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function printCurrentReport() {
  const scoutReportIsVisible = !document.getElementById("byScoutReport").hidden;

  if (scoutReportIsVisible && !scoutSelect.value) {
    showMessage("Select a Scout before creating the PDF report.", "error");
    return;
  }

  window.print();
}

function handleSnapshotError(error) {
  showMessage(`Unable to load report data: ${error.message}`, "error");
}

function showMessage(text, type) {
  const message = document.getElementById("reportMessage");
  message.textContent = text;
  message.className = `message no-print ${type}`;
}
