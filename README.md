# EventSphere 2026 — Event Management System

A responsive Bootstrap + vanilla JavaScript + Firebase Authentication + Cloud Firestore starter project.

## Features
- Separate student and admin experiences
- Student email/password signup and login
- Student profile with unique roll-number reservation (Firestore transaction)
- Event creation and deletion for admins
- Student event registration, duplicate registration prevention, seat-capacity check
- Dashboard analytics and searchable event/student lists
- Responsive animated dark-glass UI

## Run locally
1. In Firebase Console, open project `event2026-3617d`.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create a **Cloud Firestore** database.
4. Open Firestore **Rules**, replace with the contents of `firestore.rules`, and publish.
5. Add your local development domain under **Authentication → Settings → Authorized domains** if needed.
6. Serve this folder through a local web server (ES modules do not work reliably with `file://`). For example, in VS Code use the Live Server extension, or run `python -m http.server 5500` in this folder and open `http://localhost:5500`.
7. The Firebase web config is in `firebase.js`. Web API keys identify a Firebase project; security must come from Authentication and Firestore rules.

## Create the admin manually (no admin signup)
1. In Firebase Console → Authentication → Users, click **Add user** and create the admin email/password.
2. Copy the admin user's UID.
3. In Firestore, create a document in the `users` collection whose document ID is exactly that UID.
4. Add these fields:
   - `uid` (string): same UID
   - `name` (string): admin display name
   - `email` (string): the same admin email
   - `role` (string): `admin`
   - `createdAt` (timestamp): current timestamp
5. Log in on the app using that admin account. Do not create admin accounts from the student signup screen.

## Important security / production notes
- This is a starter project, not a fully audited production system. Review rules and test with the Firebase Emulator before public deployment.
- Do not trust client-side role checks alone; Firestore rules must enforce authorization. For a production deployment, create admin roles with a trusted server/Admin SDK or custom claims rather than relying on the browser.
- Duplicate emails are blocked by Firebase Authentication. Roll-number uniqueness is enforced by a Firestore transaction on `rollNumbers/{encodedRollNumber}`.
- Firestore rules cannot fully validate all business logic. For high-integrity event capacity, use a trusted backend or a transaction-based event counter; client-only query-based capacity checks can race under simultaneous registrations.
- Admin student management currently includes search/view. Add a trusted backend or carefully scoped admin workflow for deleting student accounts, since deleting a Firestore profile alone does not delete their Firebase Authentication account.
- Never put Firebase Admin SDK credentials or service-account private keys in browser code.
