import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { insertAccount, openSession } from "./access.mjs";
import { Problem, transaction } from "./db.mjs";

const derive = promisify(scrypt);
const cost = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function credentials(input, creating) {
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = input.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    throw new Problem(422, "Saisissez une adresse e-mail valide.");
  if (
    typeof password !== "string" ||
    password.length > 256 ||
    (creating && password.length < 10)
  )
    throw new Problem(
      422,
      "Le mot de passe doit contenir entre 10 et 256 caractères.",
    );
  return { email, password };
}
function optionalName(value) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.trim().length > 100)
    throw new Problem(
      422,
      "Le nom et le prénom sont limités à 100 caractères chacun.",
    );
  return value.trim();
}
export async function preparePassword(input) {
  const { email, password } = credentials(input, true);
  const salt = randomBytes(16).toString("hex");
  const verifier = (await derive(password, salt, 64, cost)).toString("hex");
  return { email, salt, verifier };
}

/** Bind a password once inside the caller's transaction. Internal account IDs also own grants and traces. */
export function bindPassword(db, login, { email, salt, verifier }) {
  if (
    db
      .prepare("SELECT 1 FROM passwords WHERE login=? OR email=?")
      .get(login, email)
  )
    throw new Problem(
      409,
      "Ce compte ou cette adresse e-mail est déjà utilisé.",
    );
  db.prepare(
    "INSERT INTO passwords(login,email,salt,verifier) VALUES(?,?,?,?)",
  ).run(login, email, salt, verifier);
}
export async function enroll(db, input) {
  const firstName = optionalName(input.firstName),
    lastName = optionalName(input.lastName);
  const record = await preparePassword(input);
  return transaction(db, () => {
    const login = record.email;
    if (db.prepare("SELECT 1 FROM accounts WHERE name=?").get(login))
      throw new Problem(409, "Cette adresse est déjà utilisée.");
    insertAccount(db, login, []);
    bindPassword(db, login, record);
    if (firstName || lastName)
      db.prepare(
        "INSERT INTO account_profiles(login,first_name,last_name) VALUES(?,?,?)",
      ).run(login, firstName, lastName);
    return openSession(db, login);
  });
}
export async function passwordLogin(db, input) {
  const { email, password } = credentials(input, false);
  const row = db.prepare("SELECT * FROM passwords WHERE email=?").get(email);
  const actual = await derive(
    password,
    row?.salt || "00000000000000000000000000000000",
    64,
    cost,
  );
  if (!row || !timingSafeEqual(actual, Buffer.from(row.verifier, "hex")))
    throw new Problem(401, "Adresse e-mail ou mot de passe incorrect.");
  return openSession(db, row.login);
}
