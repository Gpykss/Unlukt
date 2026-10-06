# Firestore rules tests

Checks the security rules block the known attacks (self-admin, KYC leak, price edits, fake
payments…) and still allow the app's normal actions. Needs Java 11+ installed.

    cd tests/rules
    npm.cmd install
    npm.cmd test

All tests must pass before running `firebase deploy --only firestore:rules`.
