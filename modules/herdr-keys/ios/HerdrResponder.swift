import UIKit

/// The first-responder lookups the key views share: who holds focus in the
/// whole app, and who holds it inside one view.
extension UIResponder {
  private static weak var herdrFound: UIResponder?

  /// The first responder now, if any: the action goes to it when sent to nil.
  static func herdrCurrentFirstResponder() -> UIResponder? {
    herdrFound = nil
    UIApplication.shared.sendAction(#selector(UIResponder.herdrCaptureFirstResponder), to: nil, from: nil, for: nil)
    return herdrFound
  }

  @objc private func herdrCaptureFirstResponder() {
    UIResponder.herdrFound = self
  }
}

extension UIView {
  /// The view inside this one (or this one) that is the first responder.
  func herdrFirstResponderInside() -> UIView? {
    if isFirstResponder { return self }
    for subview in subviews {
      if let found = subview.herdrFirstResponderInside() { return found }
    }
    return nil
  }
}

extension Notification.Name {
  /// Posted by a view that held focus and is neither a text field nor a text
  /// view, when it lets go (the pane terminal, in herdr-terminal, which posts
  /// the same name as a string): `FindKeyView` hears no other sign of it.
  static let herdrFocusReleased = Notification.Name("HerdrFocusReleased")
}
