import { createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const registerForm = document.getElementById("registerForm");
const registerButton = document.getElementById("registerButton");
const accountIdInput = document.getElementById("accountId");
const message = document.getElementById("message");

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("name").value.trim();
  const accountId = accountIdInput.value.trim();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password !== confirmPassword) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  setLoading(true);

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const profile = {
      uid: credential.user.uid,
      name,
      email,
      role: "pending",
      requestedRole: "leader",
      status: "pending",
      createdAt: serverTimestamp(),
      leaderId: accountId,
    };

    await setDoc(doc(db, "users", credential.user.uid), profile);
    await signOut(auth);
    showMessage("Registration submitted. An existing Adult Leader must approve your account.", "success");
    registerForm.reset();
  } catch (error) {
    const friendlyMessages = {
      "auth/email-already-in-use": "This email is already registered.",
      "auth/weak-password": "Please choose a stronger password.",
      "auth/invalid-email": "Please enter a valid email address.",
    };
    showMessage(friendlyMessages[error.code] || error.message, "error");
  } finally {
    setLoading(false);
  }
});

function setLoading(isLoading) {
  registerButton.disabled = isLoading;
  registerButton.textContent = isLoading ? "Creating account..." : "Register";
}

function showMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type}`;
}
