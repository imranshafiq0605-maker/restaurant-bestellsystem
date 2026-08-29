import UIKit
import Capacitor
import FirebaseAuth
import WebKit

@objc(NativeMfaPlugin)
class NativeMfaPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NativeMfaPlugin"
    let jsName = "NativeMfa"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sendEnrollmentCode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirmEnrollmentCode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startEmailSignIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startProviderSignIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendSignInCode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirmSignInCode", returnType: CAPPluginReturnPromise)
    ]
    private var signInResolver: MultiFactorResolver?

    private func resolveSignedInUser(_ user: User, call: CAPPluginCall) {
        user.getIDTokenForcingRefresh(true) { token, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            guard let token = token else {
                call.reject("Firebase hat kein gültiges Anmeldetoken erstellt.")
                return
            }
            self.signInResolver = nil
            call.resolve(["mfaRequired": false, "idToken": token])
        }
    }

    private func handleNativeSignIn(_ result: AuthDataResult?, error: Error?, call: CAPPluginCall) {
        if let error = error {
            let authError = error as NSError
            if authError.code == AuthErrorCode.secondFactorRequired.rawValue,
               let resolver = authError.userInfo[AuthErrorUserInfoMultiFactorResolverKey] as? MultiFactorResolver {
                signInResolver = resolver
                let phone = (resolver.hints.first as? PhoneMultiFactorInfo)?.phoneNumber ?? "Mobiltelefon"
                call.resolve(["mfaRequired": true, "phoneHint": phone])
                return
            }
            call.reject(error.localizedDescription)
            return
        }
        guard let user = result?.user else {
            call.reject("Firebase konnte den Account nicht anmelden.")
            return
        }
        resolveSignedInUser(user, call: call)
    }

    @objc func sendEnrollmentCode(_ call: CAPPluginCall) {
        guard let phoneNumber = call.getString("phoneNumber"), phoneNumber.hasPrefix("+") else {
            call.reject("Telefonnummer bitte mit Ländervorwahl eingeben, z. B. +49.")
            return
        }
        guard let user = Auth.auth().currentUser else {
            call.reject("Die iPhone-Anmeldung ist nicht aktiv. Bitte melde dich erneut an.")
            return
        }

        user.multiFactor.getSessionWithCompletion { session, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            guard let session = session else {
                call.reject("Die sichere SMS-Sitzung konnte nicht erstellt werden.")
                return
            }
            PhoneAuthProvider.provider().verifyPhoneNumber(
                phoneNumber,
                uiDelegate: nil,
                multiFactorSession: session
            ) { verificationId, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                    return
                }
                guard let verificationId = verificationId else {
                    call.reject("Firebase hat keine SMS-Bestätigung erstellt.")
                    return
                }
                call.resolve(["verificationId": verificationId])
            }
        }
    }

    @objc func confirmEnrollmentCode(_ call: CAPPluginCall) {
        guard let verificationId = call.getString("verificationId"),
              let verificationCode = call.getString("verificationCode") else {
            call.reject("SMS-Code oder Bestätigungs-ID fehlt.")
            return
        }
        guard let user = Auth.auth().currentUser else {
            call.reject("Die iPhone-Anmeldung ist nicht aktiv. Bitte melde dich erneut an.")
            return
        }

        let credential = PhoneAuthProvider.provider().credential(
            withVerificationID: verificationId,
            verificationCode: verificationCode
        )
        let assertion = PhoneMultiFactorGenerator.assertion(with: credential)
        user.multiFactor.enroll(with: assertion, displayName: "Mobiltelefon") { error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve()
        }
    }

    @objc func startEmailSignIn(_ call: CAPPluginCall) {
        guard let email = call.getString("email"), let password = call.getString("password") else {
            call.reject("E-Mail-Adresse oder Passwort fehlt.")
            return
        }
        Auth.auth().signIn(withEmail: email, password: password) { result, error in
            self.handleNativeSignIn(result, error: error, call: call)
        }
    }

    @objc func startProviderSignIn(_ call: CAPPluginCall) {
        guard let provider = call.getString("provider"), let idToken = call.getString("idToken") else {
            call.reject("Das Anmeldetoken des Anbieters fehlt.")
            return
        }
        let credential: AuthCredential
        if provider == "google" {
            credential = GoogleAuthProvider.credential(
                withIDToken: idToken,
                accessToken: call.getString("accessToken") ?? ""
            )
        } else if provider == "apple", let nonce = call.getString("nonce") {
            credential = OAuthProvider.credential(
                providerID: .apple,
                idToken: idToken,
                rawNonce: nonce
            )
        } else {
            call.reject("Dieser Anmeldeanbieter wird nicht unterstützt.")
            return
        }
        Auth.auth().signIn(with: credential) { result, error in
            self.handleNativeSignIn(result, error: error, call: call)
        }
    }

    @objc func sendSignInCode(_ call: CAPPluginCall) {
        guard let resolver = signInResolver,
              let phoneHint = resolver.hints.first as? PhoneMultiFactorInfo else {
            call.reject("Die sichere Anmeldung ist abgelaufen. Bitte melde dich erneut an.")
            return
        }
        PhoneAuthProvider.provider().verifyPhoneNumber(
            with: phoneHint,
            uiDelegate: nil,
            multiFactorSession: resolver.session
        ) { verificationId, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            guard let verificationId = verificationId else {
                call.reject("Firebase hat keine SMS-Bestätigung erstellt.")
                return
            }
            call.resolve(["verificationId": verificationId])
        }
    }

    @objc func confirmSignInCode(_ call: CAPPluginCall) {
        guard let resolver = signInResolver,
              let verificationId = call.getString("verificationId"),
              let verificationCode = call.getString("verificationCode") else {
            call.reject("Die SMS-Anmeldung ist unvollständig oder abgelaufen.")
            return
        }
        let credential = PhoneAuthProvider.provider().credential(
            withVerificationID: verificationId,
            verificationCode: verificationCode
        )
        let assertion = PhoneMultiFactorGenerator.assertion(with: credential)
        resolver.resolveSignIn(with: assertion) { result, error in
            self.handleNativeSignIn(result, error: error, call: call)
        }
    }
}

class LaRosaBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeMfaPlugin())

        // iOS 27 can deadlock when Capacitor 8.5 performs its two synchronous
        // configuration prompts at document start. This app loads its HTTPS
        // origin directly, so WebKit's native cookies and fetch are sufficient.
        guard let contentController = webView?.configuration.userContentController else { return }
        let compatibleScripts = contentController.userScripts.map { script in
            let source = script.source
                .replacingOccurrences(
                    of: "const isCookiesEnabled = prompt(JSON.stringify(payload));",
                    with: "const isCookiesEnabled = 'false';"
                )
                .replacingOccurrences(
                    of: "const isHttpEnabled = prompt(JSON.stringify(payload));",
                    with: "const isHttpEnabled = 'false';"
                )
            return WKUserScript(
                source: source,
                injectionTime: script.injectionTime,
                forMainFrameOnly: script.isForMainFrameOnly
            )
        }
        contentController.removeAllUserScripts()
        compatibleScripts.forEach(contentController.addUserScript)
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = LaRosaBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
