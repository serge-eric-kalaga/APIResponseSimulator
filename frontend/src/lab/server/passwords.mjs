import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { hash, insertAccount, openSession } from "./access.mjs";
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
/** An old key can only bind its own account. Sessions keep the original login and grants. */
export async function enroll(db, input, migrate = false) {
  const { email, password } = credentials(input, true);
  const salt = randomBytes(16).toString("hex");
  const verifier = (await derive(password, salt, 64, cost)).toString("hex");
  return transaction(db, () => {
    let login = email;
    if (migrate) {
      const old = db
        .prepare(
          "SELECT name FROM accounts WHERE key_hash=? AND NOT EXISTS (SELECT 1 FROM passwords WHERE login=accounts.name)",
        )
        .get(hash(String(input.key || "")));
      if (!old)
        throw new Problem(
          401,
          "La clé de l’ancien compte est invalide ou a déjà été utilisée.",
        );
      login = old.name;
    }
    if (
      db.prepare("SELECT 1 FROM passwords WHERE email=?").get(email) ||
      (!migrate && db.prepare("SELECT 1 FROM accounts WHERE name=?").get(login))
    )
      throw new Problem(409, "Cette adresse est déjà utilisée.");
    if (!migrate) insertAccount(db, login, []);
    db.prepare("INSERT INTO passwords VALUES(?,?,?,?)").run(
      login,
      email,
      salt,
      verifier,
    );
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
