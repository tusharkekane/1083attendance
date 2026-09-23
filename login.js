import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const message = document.getElementById("message");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoading(true);

  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const profileSnapshot = await getDoc(doc(db, "users", credential.user.uid));

    if (!profileSnapshot.exists()) {
      throw new Error("Your account profile could not be found. Ask an Adult Leader for help.");
    }

    const profile = profileSnapshot.data();

    if (profile.status === "inactive") {
      await signOut(auth);
      const accountType = profile.role === "leader" ? "Adult Leader" : "Scout";
      showMessage(`This ${accountType} account has been archived. Ask an active Adult Leader for help.`, "error");
      return;
    }

    if (profile.role === "pending") {
      await signOut(auth);
      showMessage("Your Adult Leader registration is waiting for approval.", "error");
      return;
    }

    window.location.replace("dashboard.html");
  } catch (error) {
    const friendlyMessage = error.code === "auth/invalid-credential"
      ? "Invalid email or password."
      : error.message;
    showMessage(friendlyMessage, "error");
  } finally {
    setLoading(false);
  }
});

function setLoading(isLoading) {
  loginButton.disabled = isLoading;
  loginButton.textContent = isLoading ? "Logging in..." : "Login";
}

function showMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type}`;
}
