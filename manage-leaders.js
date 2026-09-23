import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

let currentUser = null;
let currentProfile = null;

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("login.html");
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

    const profile = profileSnapshot.data();

    if (profile.role !== "leader" || profile.status !== "active") {
      window.location.replace("dashboard.html");
      return;
    }

    currentUser = user;
    currentProfile = profile;
    document.getElementById("welcome").textContent = `Signed in as ${profile.name}, Adult Leader`;

    onSnapshot(
      query(collection(db, "users"), where("requestedRole", "==", "leader")),
      (snapshot) => {
        const leaders = snapshot.docs
          .map((item) => ({ uid: item.id, ...item.data() }))
          .sort((a, b) => a.name.localeCompare(b.name));
        renderLeaderRosters(leaders);
      },
      (error) => showMessage(`Unable to load Adult Leaders: ${error.message}`, "error")
    );
  } catch (error) {
    showMessage(error.message, "error");
  }
});

function renderLeaderRosters(leaders) {
  const pendingRoster = document.getElementById("pendingLeaderRoster");
  const activeRoster = document.getElementById("activeLeaderRoster");
  const archivedRoster = document.getElementById("archivedLeaderRoster");
  const pendingLeaders = leaders.filter((leader) => leader.role === "pending");
  const activeLeaders = leaders.filter(
    (leader) => leader.role === "leader" && leader.status !== "inactive"
  );
  const archivedLeaders = leaders.filter(
    (leader) => leader.role === "leader" && leader.status === "inactive"
  );

  pendingRoster.innerHTML = "";
  activeRoster.innerHTML = "";
  archivedRoster.innerHTML = "";

  pendingLeaders.forEach((leader) => {
    const row = createRosterRow(leader.name, `${leader.leaderId} · ${leader.email}`);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Approve Leader";
    button.addEventListener("click", () => approveLeader(leader, button));
    row.appendChild(button);
    pendingRoster.appendChild(row);
  });

  activeLeaders.forEach((leader) => {
    const row = createRosterRow(leader.name, `${leader.leaderId} · ${leader.email}`);

    if (leader.uid === currentUser.uid) {
      const badge = document.createElement("span");
      badge.className = "status-badge";
      badge.textContent = "Current account";
      row.appendChild(badge);
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Remove Leader";
      button.className = "archive-button";
      button.addEventListener("click", () => {
        if (window.confirm(`Remove ${leader.name}'s Adult Leader access? Their history will be preserved.`)) {
          archiveLeader(leader, button);
        }
      });
      row.appendChild(button);
    }

    activeRoster.appendChild(row);
  });

  archivedLeaders.forEach((leader) => {
    const archiveDetails = leader.archivedByName
      ? `${leader.leaderId} · Removed by ${leader.archivedByName}`
      : `${leader.leaderId} · Archived`;
    const row = createRosterRow(leader.name, archiveDetails);
    row.classList.add("archived-row");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Restore Leader";
    button.className = "secondary-button";
    button.addEventListener("click", () => restoreLeader(leader, button));
    row.appendChild(button);
    archivedRoster.appendChild(row);
  });

  if (!pendingRoster.children.length) {
    addEmptyMessage(pendingRoster, "No Adult Leader registrations are waiting for approval.");
  }

  if (!activeRoster.children.length) {
    addEmptyMessage(activeRoster, "No active Adult Leaders.");
  }

  if (!archivedRoster.children.length) {
    addEmptyMessage(archivedRoster, "No archived Adult Leaders.");
  }
}

async function approveLeader(leader, button) {
  if (!window.confirm(`Approve ${leader.name} as an Adult Leader?`)) {
    return;
  }

  button.disabled = true;

  try {
    await updateDoc(doc(db, "users", leader.uid), {
      role: "leader",
      status: "active",
      approvedByUid: currentUser.uid,
      approvedByName: currentProfile.name,
      approvedAt: serverTimestamp(),
    });
    showMessage(`${leader.name} is now approved as an Adult Leader.`, "success");
  } catch (error) {
    button.disabled = false;
    showMessage(error.message, "error");
  }
}

async function archiveLeader(leader, button) {
  button.disabled = true;

  try {
    await updateDoc(doc(db, "users", leader.uid), {
      status: "inactive",
      archivedByUid: currentUser.uid,
      archivedByName: currentProfile.name,
      archivedAt: serverTimestamp(),
    });
    showMessage(`${leader.name}'s Adult Leader access was removed.`, "success");
  } catch (error) {
    button.disabled = false;
    showMessage(error.message, "error");
  }
}

async function restoreLeader(leader, button) {
  if (!window.confirm(`Restore ${leader.name}'s Adult Leader access?`)) {
    return;
  }

  button.disabled = true;

  try {
    await updateDoc(doc(db, "users", leader.uid), {
      status: "active",
      restoredByUid: currentUser.uid,
      restoredByName: currentProfile.name,
      restoredAt: serverTimestamp(),
    });
    showMessage(`${leader.name}'s Adult Leader access was restored.`, "success");
  } catch (error) {
    button.disabled = false;
    showMessage(error.message, "error");
  }
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

function showMessage(text, type) {
  const message = document.getElementById("managementMessage");
  message.textContent = text;
  message.className = `message ${type}`;
}
