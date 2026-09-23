import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

let currentUser = null;
let currentProfile = null;
let scouts = [];
let attendanceRecords = [];
let activityRecords = [];
let noteRecords = [];
let listenersStarted = false;
let displayedDate = getToday();
let selectedNoteScout = null;

const welcome = document.getElementById("welcome");
const scoutPanel = document.getElementById("scoutPanel");
const leaderPanel = document.getElementById("leaderPanel");
const scoutAttendanceBtn = document.getElementById("scoutAttendanceBtn");
const manageScoutsLink = document.getElementById("manageScoutsLink");
const manageLeadersLink = document.getElementById("manageLeadersLink");
const reportsLink = document.getElementById("reportsLink");
const notesHistoryPanel = document.getElementById("notesHistoryPanel");
const noteDialog = document.getElementById("noteDialog");
const noteForm = document.getElementById("noteForm");

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("login.html");
});

scoutAttendanceBtn.addEventListener("click", () => {
  const scout = {
    uid: currentUser.uid,
    name: currentProfile.name,
    scoutId: currentProfile.scoutId,
  };
  markAttendance(scout);
});

document.getElementById("closeNoteDialog").addEventListener("click", closeNoteDialog);
document.getElementById("cancelNote").addEventListener("click", closeNoteDialog);
noteForm.addEventListener("submit", saveScoutNote);
noteDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeNoteDialog();
});

setInterval(checkForNewDate, 30000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    checkForNewDate();
  }
});

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

    currentUser = user;
    currentProfile = profileSnapshot.data();

    if (currentProfile.status === "inactive") {
      await signOut(auth);
      window.location.replace("login.html");
      return;
    }

    if (currentProfile.role === "pending") {
      await signOut(auth);
      window.location.replace("login.html");
      return;
    }

    const roleLabel = currentProfile.role === "leader" ? "Adult Leader" : "Scout";
    welcome.textContent = `Welcome, ${currentProfile.name} (${roleLabel})`;

    if (currentProfile.role === "leader") {
      try {
        await openAttendanceDay();
      } catch (error) {
        showMessage(`Scout self-check-in could not be opened: ${error.message}`, "error");
      }
    }

    if (!listenersStarted) {
      listenersStarted = true;
      startDataListeners();
    }
  } catch (error) {
    showMessage(error.message, "error");
  }
});

function startDataListeners() {
  const isLeader = currentProfile.role === "leader";

  scoutPanel.hidden = isLeader;
  leaderPanel.hidden = !isLeader;
  manageScoutsLink.hidden = !isLeader;
  manageLeadersLink.hidden = !isLeader;
  reportsLink.hidden = !isLeader;

  if (isLeader) {
    notesHistoryPanel.hidden = false;

    onSnapshot(
      query(collection(db, "users"), where("role", "==", "scout")),
      (snapshot) => {
        scouts = snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }));
        scouts.sort((a, b) => a.name.localeCompare(b.name));
        renderScoutRoster();
      },
      handleSnapshotError
    );

    onSnapshot(
      collection(db, "scoutNotes"),
      (snapshot) => {
        noteRecords = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        renderScoutRoster();
        renderNotesHistory();
      },
      handleSnapshotError
    );
  }

  const attendanceQuery = isLeader
    ? collection(db, "attendance")
    : query(collection(db, "attendance"), where("scoutUid", "==", currentUser.uid));

  onSnapshot(
    attendanceQuery,
    (snapshot) => {
      attendanceRecords = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderScoutRoster();
      renderScoutStatus();
    },
    handleSnapshotError
  );

  const activityQuery = isLeader
    ? collection(db, "attendanceAudit")
    : query(collection(db, "attendanceAudit"), where("scoutUid", "==", currentUser.uid));

  onSnapshot(
    activityQuery,
    (snapshot) => {
      activityRecords = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderActivity();
    },
    handleSnapshotError
  );
}

async function openAttendanceDay() {
  await setDoc(doc(db, "settings", "attendance"), {
    activeDate: getToday(),
    openedAt: serverTimestamp(),
    openedByUid: currentUser.uid,
    openedByName: currentProfile.name,
  });
}

function renderScoutRoster() {
  if (!currentProfile || currentProfile.role !== "leader") {
    return;
  }

  const pendingRoster = document.getElementById("pendingScoutRoster");
  const presentRoster = document.getElementById("presentScoutRoster");
  const today = getToday();
  const activeScouts = scouts.filter((scout) => scout.status !== "inactive");

  pendingRoster.innerHTML = "";
  presentRoster.innerHTML = "";

  if (scouts.length === 0) {
    addEmptyMessage(pendingRoster, "No Scouts are registered yet.");
    addEmptyMessage(presentRoster, "No Scouts are present today.");
    return;
  }

  activeScouts.forEach((scout) => {
    const attendance = attendanceRecords.find(
      (record) => record.scoutUid === scout.uid && record.date === today
    );
    const scoutNote = noteRecords.find(
      (record) => record.scoutUid === scout.uid && record.date === today
    );
    const row = createRosterRow(scout.name, `${scout.scoutId} · ${scout.email}`);
    const details = row.querySelector(".student-details");
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const button = document.createElement("button");
    button.type = "button";
    const noteButton = document.createElement("button");
    noteButton.type = "button";
    noteButton.className = "note-button";
    noteButton.textContent = scoutNote ? "Edit Note" : "Add Note";
    noteButton.addEventListener("click", () => openNoteDialog(scout, scoutNote));

    if (scoutNote) {
      const noteSummary = document.createElement("span");
      noteSummary.className = "scout-note-summary";
      noteSummary.textContent = `${getNoteLabel(scoutNote.type)}${scoutNote.note ? ` — ${scoutNote.note}` : ""}`;
      details.appendChild(noteSummary);
    }

    if (attendance?.status === "Present") {
      const marker = document.createElement("span");
      marker.className = "marked-by";
      marker.textContent = `Marked by ${attendance.markedByName}`;
      details.appendChild(marker);

      button.textContent = "Unmark";
      button.className = "danger-button";
      button.addEventListener("click", () => {
        if (window.confirm(`Unmark ${scout.name}'s attendance for today?`)) {
          unmarkAttendance(scout);
        }
      });
      actions.append(button, noteButton);
      row.appendChild(actions);
      presentRoster.appendChild(row);
    } else {
      if (attendance?.unmarkedByName) {
        const unmarker = document.createElement("span");
        unmarker.className = "unmarked-by";
        unmarker.textContent = `Unmarked by ${attendance.unmarkedByName}`;
        details.appendChild(unmarker);
      }

      button.textContent = "Mark Present";
      button.addEventListener("click", () => markAttendance(scout));
      actions.append(button, noteButton);
      row.appendChild(actions);
      pendingRoster.appendChild(row);
    }
  });

  if (!pendingRoster.children.length) {
    addEmptyMessage(pendingRoster, "Everyone has been marked present today.");
  }

  if (!presentRoster.children.length) {
    addEmptyMessage(presentRoster, "No Scouts are present today.");
  }

}

function openNoteDialog(scout, existingNote) {
  selectedNoteScout = scout;
  const dialogMessage = document.getElementById("noteDialogMessage");
  dialogMessage.textContent = "";
  dialogMessage.className = "message";
  document.getElementById("noteDialogTitle").textContent = `${existingNote ? "Edit" : "Add"} note for ${scout.name}`;
  document.getElementById("noteType").value = existingNote?.type || "sick";
  document.getElementById("noteText").value = existingNote?.note || "";
  noteDialog.showModal();
}

function closeNoteDialog() {
  noteDialog.close();
  noteForm.reset();
  selectedNoteScout = null;
}

async function saveScoutNote(event) {
  event.preventDefault();

  if (!selectedNoteScout || currentProfile.role !== "leader") {
    return;
  }

  const saveButton = document.getElementById("saveNoteButton");
  const date = getToday();
  const type = document.getElementById("noteType").value;
  const note = document.getElementById("noteText").value.trim();
  const noteId = `${selectedNoteScout.uid}_${date}`;
  const existingNote = noteRecords.find((record) => record.id === noteId);
  const scoutName = selectedNoteScout.name;

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    const noteData = {
      scoutUid: selectedNoteScout.uid,
      scoutId: selectedNoteScout.scoutId,
      scoutName: selectedNoteScout.name,
      date,
      type,
      note,
      updatedByUid: currentUser.uid,
      updatedByName: currentProfile.name,
      updatedAt: serverTimestamp(),
    };

    if (!existingNote) {
      noteData.createdByUid = currentUser.uid;
      noteData.createdByName = currentProfile.name;
      noteData.createdAt = serverTimestamp();
    }

    await setDoc(doc(db, "scoutNotes", noteId), noteData, { merge: true });
    closeNoteDialog();
    showMessage(`Note saved for ${scoutName}.`, "success");
  } catch (error) {
    const dialogMessage = document.getElementById("noteDialogMessage");
    dialogMessage.textContent = error.message;
    dialogMessage.className = "message error";
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save Note";
  }
}

function renderScoutStatus() {
  if (!currentProfile || currentProfile.role !== "scout") {
    return;
  }

  const todayRecord = attendanceRecords.find((record) => record.date === getToday());
  const statusText = document.getElementById("scoutStatusText");
  const isPresent = todayRecord?.status === "Present";

  scoutAttendanceBtn.disabled = isPresent;
  scoutAttendanceBtn.textContent = isPresent ? "Present Today" : "Mark My Attendance";

  if (isPresent) {
    statusText.textContent = `Attendance marked by ${todayRecord.markedByName}.`;
  } else if (todayRecord?.status === "Unmarked") {
    statusText.textContent = `Attendance was unmarked by ${todayRecord.unmarkedByName}. You may mark it again.`;
  } else {
    statusText.textContent = "Mark yourself present for today.";
  }
}

async function markAttendance(scout) {
  const today = getToday();
  const attendanceRef = doc(db, "attendance", `${scout.uid}_${today}`);
  const auditRef = doc(collection(db, "attendanceAudit"));

  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(attendanceRef);

      if (snapshot.exists() && snapshot.data().status === "Present") {
        throw new Error(`${scout.name} is already marked present today.`);
      }

      const attendance = {
        scoutUid: scout.uid,
        scoutId: scout.scoutId,
        scoutName: scout.name,
        date: today,
        status: "Present",
        markedByUid: currentUser.uid,
        markedByName: currentProfile.name,
        markedByRole: currentProfile.role,
        markedAt: serverTimestamp(),
        unmarkedByUid: null,
        unmarkedByName: null,
        unmarkedAt: null,
        updatedAt: serverTimestamp(),
      };

      transaction.set(attendanceRef, attendance);
      transaction.set(auditRef, {
        scoutUid: scout.uid,
        scoutId: scout.scoutId,
        scoutName: scout.name,
        date: today,
        action: "marked",
        actorUid: currentUser.uid,
        actorName: currentProfile.name,
        actorRole: currentProfile.role,
        createdAt: serverTimestamp(),
      });
    });

    showMessage(`${scout.name}'s attendance was marked by ${currentProfile.name}.`, "success");
  } catch (error) {
    const message = error.code === "permission-denied" && currentProfile.role === "scout"
      ? "Today's Scout self-check-in is not open. Please ask an Adult Leader to open the dashboard."
      : error.message;
    showMessage(message, "error");
  }
}

async function unmarkAttendance(scout) {
  if (currentProfile.role !== "leader") {
    showMessage("Only an Adult Leader can unmark attendance.", "error");
    return;
  }

  const today = getToday();
  const attendanceRef = doc(db, "attendance", `${scout.uid}_${today}`);
  const auditRef = doc(collection(db, "attendanceAudit"));

  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(attendanceRef);

      if (!snapshot.exists() || snapshot.data().status !== "Present") {
        throw new Error(`${scout.name} is not marked present today.`);
      }

      transaction.update(attendanceRef, {
        status: "Unmarked",
        unmarkedByUid: currentUser.uid,
        unmarkedByName: currentProfile.name,
        unmarkedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.set(auditRef, {
        scoutUid: scout.uid,
        scoutId: scout.scoutId,
        scoutName: scout.name,
        date: today,
        action: "unmarked",
        actorUid: currentUser.uid,
        actorName: currentProfile.name,
        actorRole: currentProfile.role,
        createdAt: serverTimestamp(),
      });
    });

    showMessage(`${scout.name}'s attendance was unmarked by ${currentProfile.name}.`, "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function renderActivity() {
  const tableBody = document.getElementById("activityTableBody");
  const emptyActivity = document.getElementById("emptyActivity");
  const sortedActivity = [...activityRecords].sort((a, b) => {
    const timeA = a.createdAt?.toMillis?.() || 0;
    const timeB = b.createdAt?.toMillis?.() || 0;
    return timeB - timeA;
  });

  tableBody.innerHTML = "";
  emptyActivity.hidden = sortedActivity.length > 0;

  sortedActivity.forEach((record) => {
    const row = document.createElement("tr");
    const actorRole = record.actorRole === "leader" ? "Adult Leader" : "Scout";
    const values = [
      record.scoutName,
      record.scoutId,
      formatActivityTime(record),
      record.action === "unmarked" ? "Unmarked" : "Marked present",
      `${record.actorName} (${actorRole})`,
    ];

    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    tableBody.appendChild(row);
  });
}

function renderNotesHistory() {
  const tableBody = document.getElementById("notesTableBody");
  const emptyNotes = document.getElementById("emptyNotes");
  const sortedNotes = [...noteRecords].sort((a, b) => {
    const dateDifference = b.date.localeCompare(a.date);

    if (dateDifference !== 0) {
      return dateDifference;
    }

    const timeA = a.updatedAt?.toMillis?.() || 0;
    const timeB = b.updatedAt?.toMillis?.() || 0;
    return timeB - timeA;
  });

  tableBody.innerHTML = "";
  emptyNotes.hidden = sortedNotes.length > 0;

  sortedNotes.forEach((record) => {
    const row = document.createElement("tr");
    const values = [
      record.scoutName,
      formatDateString(record.date),
      getNoteLabel(record.type),
      record.note || "—",
      record.updatedByName,
    ];

    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 3) {
        cell.className = "note-cell";
      }
      row.appendChild(cell);
    });

    tableBody.appendChild(row);
  });
}

function getNoteLabel(type) {
  const labels = {
    sick: "Out sick",
    "left-early": "Left early",
    other: "Other",
  };
  return labels[type] || "Other";
}

function formatDateString(date) {
  const [year, month, day] = date.split("-");
  return `${month}/${day}/${year}`;
}

function createRosterRow(nameText, informationText) {
  const row = document.createElement("div");
  row.className = "student-row";

  const details = document.createElement("div");
  details.className = "student-details";

  const name = document.createElement("strong");
  name.textContent = nameText;

  const information = document.createElement("span");
  information.textContent = informationText;

  details.append(name, information);
  row.appendChild(details);
  return row;
}

function addEmptyMessage(container, text) {
  const message = document.createElement("p");
  message.className = "empty-state";
  message.textContent = text;
  container.appendChild(message);
}

function getToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function checkForNewDate() {
  const currentDate = getToday();

  if (currentDate === displayedDate) {
    return;
  }

  if (currentProfile?.role === "leader") {
    try {
      await openAttendanceDay();
    } catch (error) {
      showMessage(`The new attendance day could not be opened: ${error.message}`, "error");
      return;
    }
  }

  displayedDate = currentDate;
  renderScoutRoster();
  renderScoutStatus();
  showMessage("A new attendance day has started. Today's roster is ready.", "success");
}

function formatActivityTime(record) {
  if (record.createdAt?.toDate) {
    return record.createdAt.toDate().toLocaleString();
  }

  const [year, month, day] = record.date.split("-");
  return `${month}/${day}/${year}`;
}

function handleSnapshotError(error) {
  showMessage(`Unable to load data: ${error.message}`, "error");
}

function showMessage(text, type) {
  const message = document.getElementById("attendanceMessage");
  message.textContent = text;
  message.className = `message ${type}`;
}
