import { deleteApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db, firebaseConfig } from "./firebase-config.js";

let currentUser = null;
let currentProfile = null;
let scouts = [];
let rosterLoaded = false;
let isAddingScout = false;

const addScoutForm = document.getElementById("addScoutForm");
const addScoutButton = document.getElementById("addScoutButton");

addScoutForm.addEventListener("submit", addScout);

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
      query(collection(db, "users"), where("role", "==", "scout")),
      (snapshot) => {
        scouts = snapshot.docs
          .map((item) => ({ uid: item.id, ...item.data() }))
          .sort((a, b) => a.name.localeCompare(b.name));
        rosterLoaded = true;
        if (!isAddingScout) {
          addScoutButton.disabled = false;
        }
        renderRosters(scouts);
      },
      (error) => showMessage(`Unable to load Scouts: ${error.message}`, "error")
    );
  } catch (error) {
    showMessage(error.message, "error");
  }
});

async function addScout(event) {
  event.preventDefault();

  if (!currentUser || currentProfile?.role !== "leader") {
    showMessage("Only an Adult Leader can add a Scout.", "error");
    return;
  }

  if (!rosterLoaded) {
    showMessage("Please wait for the Scout roster to finish loading.", "error");
    return;
  }

  const name = document.getElementById("scoutName").value.trim();
  const scoutId = document.getElementById("scoutId").value.trim();
  const email = document.getElementById("scoutEmail").value.trim().toLowerCase();
  const password = document.getElementById("scoutPassword").value;
  const confirmPassword = document.getElementById("confirmScoutPassword").value;

  if (password !== confirmPassword) {
    showMessage("The Scout passwords do not match.", "error");
    return;
  }

  const duplicateScoutId = scouts.some(
    (scout) => scout.scoutId?.toLowerCase() === scoutId.toLowerCase()
  );

  if (duplicateScoutId) {
    showMessage("This Scout ID is already registered.", "error");
    return;
  }

  isAddingScout = true;
  addScoutButton.disabled = true;
  addScoutButton.textContent = "Adding Scout...";

  const secondaryApp = initializeApp(firebaseConfig, `scout-creator-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  let createdScoutUser = null;

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    createdScoutUser = credential.user;

    await setDoc(doc(db, "users", credential.user.uid), {
      uid: credential.user.uid,
      name,
      email,
      role: "scout",
      requestedRole: "scout",
      status: "active",
      scoutId,
      createdByUid: currentUser.uid,
      createdByName: currentProfile.name,
      createdAt: serverTimestamp(),
    });

    addScoutForm.reset();
    showMessage(`${name} was added to the active Scout roster.`, "success");
  } catch (error) {
    if (createdScoutUser) {
      try {
        await deleteUser(createdScoutUser);
      } catch (cleanupError) {
        console.error("Unable to clean up the incomplete Scout account:", cleanupError);
      }
    }

    const friendlyMessages = {
      "auth/email-already-in-use": "This email is already registered.",
      "auth/weak-password": "Please choose a stronger password.",
      "auth/invalid-email": "Please enter a valid email address.",
    };
    showMessage(friendlyMessages[error.code] || error.message, "error");
  } finally {
    try {
      await signOut(secondaryAuth);
    } catch (error) {
      console.warn("Secondary sign-out was not needed:", error);
    }
    await deleteApp(secondaryApp);
    isAddingScout = false;
    addScoutButton.disabled = false;
    addScoutButton.textContent = "Add Scout";
  }
}

function renderRosters(scouts) {
  const activeRoster = document.getElementById("activeScoutRoster");
  const archivedRoster = document.getElementById("archivedScoutRoster");
  const activeScouts = scouts.filter((scout) => scout.status !== "inactive");
  const archivedScouts = scouts.filter((scout) => scout.status === "inactive");

  activeRoster.innerHTML = "";
  archivedRoster.innerHTML = "";

  activeScouts.forEach((scout) => {
    const row = createRosterRow(scout.name, `${scout.scoutId} · ${scout.email}`);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Remove Scout";
    button.className = "archive-button";
    button.addEventListener("click", () => {
      if (window.confirm(`Remove ${scout.name} from the active roster? Their attendance history will be preserved.`)) {
        archiveScout(scout, button);
      }
    });
    row.appendChild(button);
    activeRoster.appendChild(row);
  });

  archivedScouts.forEach((scout) => {
    const archiveDetails = scout.archivedByName
      ? `${scout.scoutId} · Removed by ${scout.archivedByName}`
      : `${scout.scoutId} · Archived`;
    const row = createRosterRow(scout.name, archiveDetails);
    row.classList.add("archived-row");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Restore Scout";
    button.className = "secondary-button";
    button.addEventListener("click", () => restoreScout(scout, button));
    row.appendChild(button);
    archivedRoster.appendChild(row);
  });

  if (!activeRoster.children.length) {
    addEmptyMessage(activeRoster, "No active Scouts.");
  }

  if (!archivedRoster.children.length) {
    addEmptyMessage(archivedRoster, "No archived Scouts.");
  }
}

async function archiveScout(scout, button) {
  button.disabled = true;

  try {
    await updateDoc(doc(db, "users", scout.uid), {
      status: "inactive",
      archivedByUid: currentUser.uid,
      archivedByName: currentProfile.name,
      archivedAt: serverTimestamp(),
    });
    showMessage(`${scout.name} was removed from the active roster.`, "success");
  } catch (error) {
    button.disabled = false;
    showMessage(error.message, "error");
  }
}

async function restoreScout(scout, button) {
  if (!window.confirm(`Restore ${scout.name} to the active roster?`)) {
    return;
  }

  button.disabled = true;

  try {
    await updateDoc(doc(db, "users", scout.uid), {
      status: "active",
      restoredByUid: currentUser.uid,
      restoredByName: currentProfile.name,
      restoredAt: serverTimestamp(),
    });
    showMessage(`${scout.name} was restored to the active roster.`, "success");
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
