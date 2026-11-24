# Google connections on mobile

The Flutter Connections screen uses the existing backend authorization URL, code exchange, spreadsheet inspection, destinations and disconnect endpoints. Google tokens and the client secret stay on the backend. Callback validation binds scheme, host, port, path and OAuth state before submitting the code.

Android browser callbacks use flutter_web_auth_2 5.1.0 and its system Auth Tab / Custom Tab implementation. Build with Gradle properties matching the host and path in the backend's existing GOOGLE_REDIRECT_URI, for example in android/gradle.properties:

    googleCallbackHost=workspace.example.com
    googleCallbackPath=/google/callback

The default host is localhost for development. Production HTTPS callbacks require Android App Links domain association for the app signing certificate on the callback domain. This deployment configuration is outside the mobile repository. There is no iOS runner checked into this project; adding one requires the associated-domain configuration documented by flutter_web_auth_2 for HTTPS callbacks.

For the Flutter web build, deploy on the same origin as the configured callback. web/index.html handles /google/callback in the authorization popup and posts the result only to the same-origin opener. Keep the server's existing SPA fallback for that path. Do not rewrite the backend redirect URI in the client. If a different callback path is configured, update the web callback handler and Android build property together.

The OAuth browser handoff and native link association have not been verified with a live configured Google account. Widget tests inject the authorization result; callback validation has separate negative tests.
