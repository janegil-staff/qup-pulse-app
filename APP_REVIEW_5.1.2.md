# App Review 5.1.2(i): client-only fix

This fix changes only the app. The API is unchanged.

## Before you resubmit

1. **Test on a device or in the simulator:**
   - Sign up and choose **Not now** on the location step. Discover should show the check-in message, not an error.
   - Tap **Check in**, then **Don't allow**. Nothing should be sent.
   - Tap **Check in**, then **Allow**. You should appear in Discover for a second account.
   - Turn off Settings → **Show me to people nearby**. Check in should ask for permission again.
   - Open another user's profile. It should not show any distance or place.
2. **App Store Connect, age rating:** App Information → Age Ratings → Edit. Answer the questionnaire, then use **Override to Higher Age Rating** and choose **18+**.
3. **App Store Connect, privacy policy URL:** App Privacy → Privacy Policy URL. It must be a public web page, and its location section must match the in-app text in `src/lib/legalContent.js`.
4. **Build and submit:**
   ```
   eas build -p ios --profile production
   eas submit -p ios --latest
   ```
   Then attach the new build to the version in App Store Connect and remove build 12.
5. Paste the reply below into the Resolution Center and click **Resubmit to App Review**.

## Reply to App Review

> Hello,
>
> Thank you for the feedback. The new build addresses each point:
>
> 1. **Age rating:** the app is now rated 18+ (Override to Higher Age Rating). Sign-up also requires a date of birth of 18 or older.
> 2. **Privacy policy:** a privacy policy URL has been added in App Store Connect. It is also available in the app under Settings → Privacy Policy.
> 3. **Blocking:** users can block anyone from that person's profile (••• → Block). A blocked user can no longer see or message them. Blocked users are managed in Settings → Blocked users.
> 4. **Permission:** before a user's location is used to show them to others, the app asks "Show you to people nearby?" with Allow / Don't allow. If the user declines, no location is sent, and the rest of the app remains usable. During sign-up, the location step can be skipped with "Not now". Permission can be withdrawn at any time in Settings → "Show me to people nearby".
> 5. **Manual check-in:** the app no longer sends the user's location automatically. The previous build updated it every time the Discover tab opened, and this has been removed. The location is sent only when the user taps **Check in** on Discover, or picks a place themselves, each time. There is no automatic check-in and no background location.
>
> In addition, the app does not display a map and no longer shows other users' distance or location. Profiles in Discover are listed without any location information.
>
> **Steps to verify:** log in with the demo account. Go to Discover, tap Check in, and choose Allow or Don't allow. To withdraw permission, go to Settings → Show me to people nearby.
>
> Thank you.
