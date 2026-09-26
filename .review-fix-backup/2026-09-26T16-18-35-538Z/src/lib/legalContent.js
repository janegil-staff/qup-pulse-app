// localpulse/app/src/lib/legalContent.js
//
// Shared Terms + Privacy content. Rendered inline on the first onboarding page
// and on the standalone Legal screen.
//
// KEPT IN SYNC WITH THE WEB by hand. qup-pulse-admin/src/app/terms/page.js and
// /privacy/page.js are the same documents. Two copies of a legal text is a
// liability — they drift, and then nobody can say which one governs — so if
// you change one, change the other in the same commit. Better still, point
// this screen at the hosted pages and delete this file.
//
// ENGLISH ONLY, and that is a real gap. This object is imported directly
// rather than read through useLang(), so a Norwegian user sees a translated
// app wrapping an English legal document. English governs either way, but
// "governs" is not the same as "is the only version a user can read".
//
// WHAT CHANGED, and why each was necessary:
//
//   Privacy 5 was FALSE. It said deleting your account "permanently removes
//   your profile, matches, and messages". Retracted messages, removed
//   messages and the snapshot stored with a report are all kept. An
//   inaccurate deletion promise is the worst kind of error in this document,
//   so that section is rewritten rather than softened.
//
//   Retraction does not delete. The app's own confirm dialog tells the sender
//   that moderators keep a copy. These documents now say the same thing; a
//   product that promises one thing and a policy that says another is the
//   problem, whichever one is more generous.
//
//   Moderator access is described. Four surfaces let staff read private
//   messages and two of them are not anchored to a report. That is
//   defensible, but only if it is disclosed.
//
//   Reporting and enforcement are described in the Terms. Apple's guideline
//   1.2 wants a reporting mechanism, a way to block, and evidence the
//   developer acts on reports.
//
// STILL TO DECIDE, not a wording problem: nothing currently deletes retracted
// messages or resolved reports, so retention is effectively indefinite. That
// is hard to defend for content a user actively withdrew after being told the
// action was permanent. A purge job — retracted messages older than 90 days,
// unless a report references them — would fix it, and this text should be
// tightened the day it lands.
//
// NOT LEGAL ADVICE. This describes what the code does, accurately. Whether it
// satisfies GDPR, the App Store guidelines or Google Play's user-data policy
// is a question for someone qualified.

export const LEGAL = {
  terms: {
    title: "Terms of Service",
    body: [
      [
        "1. Eligibility",
        "You must be at least 18 years old to create an account or use this app. By using the app you represent that you meet this requirement.",
      ],
      [
        "2. Your account",
        "You are responsible for the accuracy of the information on your profile and for keeping your login credentials secure. You may delete your account at any time from Settings.",
      ],
      [
        "3. Community conduct",
        "You agree not to harass, threaten, impersonate, or post unlawful, hateful, or sexually explicit content. Accounts that violate these rules may be suspended or removed.",
      ],
      [
        "4. Content",
        "You retain ownership of the photos and text you post, but grant us a license to display them within the app to provide the service.",
      ],
      [
        "5. Safety",
        "Meeting people carries risk. Always meet in public, tell a friend your plans, and use your judgment. We do not conduct background checks on users.",
      ],
      [
        "6. Reporting and moderation",
        "You can report any message, post or profile from inside the app, and you can block any user. Reports go to our moderation team and we aim to review them promptly. To judge a report fairly we may read the reported content and the conversation around it. We may remove a message, post or comment that breaks these terms, and we may suspend or close an account — removing content on its own does not stop someone repeating it, so serious or repeated breaches are dealt with at the account level. If we act on your content or your account and you believe we got it wrong, contact us and we will look at it again.",
      ],
      [
        "7. Deleting your messages",
        "You can hide a message from your own view. That changes nothing for the other person, they are not told, and you can undo it. You can also retract your own message, which removes it for both of you and cannot be undone. Retracting removes a message from the app for everyone, but does not erase it from our servers: we keep the text so a report about it can still be dealt with. A message that has already been reported cannot be retracted until our moderators have reviewed it.",
      ],
      [
        "8. Termination",
        "We may suspend or terminate accounts that violate these terms. You may stop using the app and delete your account at any time.",
      ],
      [
        "9. Changes",
        "We may update these terms; continued use after changes means you accept the updated terms.",
      ],
    ],
  },
  privacy: {
    title: "Privacy Policy",
    body: [
      [
        "1. What we collect",
        "Account details (name, email, date of birth, gender), profile content (photos, bio, interests), approximate location for discovery, and usage data needed to run the service.",
      ],
      [
        "2. How we use it",
        "To create your profile, show you nearby people, enable matches and messaging, and keep the community safe. We do not sell your personal data.",
      ],
      [
        "3. Location",
        "We use your approximate location to show and rank nearby profiles. Coordinates are rounded before they are stored, so we hold an approximate position rather than an exact one. You can disable location in your device settings, though discovery depends on it.",
      ],
      [
        "4. Sharing",
        "Your profile is visible to other users of the app. We share data with service providers (such as image hosting) only as needed to operate the service.",
      ],
      [
        "5. Your messages",
        "Private messages are stored so they can be delivered and read. Three different things can happen to a message and they are not the same. Hiding removes it from your own view only: the other person keeps their copy, is not told, and the message itself is unchanged. Retracting withdraws your own message so it disappears for both of you; this cannot be undone, and the text is not erased from our servers because we keep it so reports about it can still be handled. Removal by our moderators takes a message down for both participants, and we can reverse it.",
      ],
      [
        "6. Moderation and staff access",
        "To keep the service safe we operate a moderation team. Staff accounts are either moderators, who act on content, or administrators, who can additionally manage accounts. When someone files a report, moderators can read the reported message and the conversation around it — a single line is rarely enough to judge a complaint fairly. A report also stores a copy of the message text as it was when the report was made, and that copy is kept even if the message is later retracted or removed. Moderators can additionally see messages participants have hidden, messages senders have retracted, and messages our team has removed; these lists are not limited to content someone has reported. Administrators can see account details including email addresses and can suspend accounts. Staff access to private messages is a real intrusion and we treat it as one: these tools exist so complaints can be answered and abuse acted on, not for browsing.",
      ],
      [
        "7. Retention and deletion",
        "We keep your data while your account is active. Deleting your account from Settings removes your profile and your matches. Messages you have hidden or retracted, messages our moderators have removed, and the copies stored with reports are kept rather than erased, so that reports and appeals about them remain answerable. If you want your messages removed along with your account, contact us and we will do so, except where we must keep something to deal with an open report or to meet a legal obligation.",
      ],
      [
        "8. Security",
        "We use industry-standard measures to protect your data, though no system is perfectly secure.",
      ],
      [
        "9. Your rights",
        "You can access, correct, or delete your information at any time from within the app, or by contacting us. If you are in the EU or EEA you also have the right to object to processing, to request a copy of your data, and to complain to your national data protection authority.",
      ],
      [
        "10. Contact",
        "For privacy questions, contact the support address listed on our website.",
      ],
    ],
  },
};
