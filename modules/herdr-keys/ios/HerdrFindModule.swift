import ExpoModulesCore
import UIKit

/// Command-F on a hardware keyboard, to find a chat from anywhere on the
/// chats screen. A module of its own, like `HerdrEscape`, so the composer's
/// view and how JS finds it are untouched.
public class HerdrFindModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HerdrFind")

    View(FindKeyView.self) {
      Events("onFind", "onEscape")

      // While the screen it wraps is the one on top: a sheet over the chats
      // (Settings, Hosts) or a chat pushed on a phone must not take Command-F.
      Prop("active") { (view: FindKeyView, active: Bool) in
        view.active = active
      }

      // While the search field has focus. Any other field inside (the
      // composer beside the list, on iPad) keeps Esc for itself.
      Prop("escape") { (view: FindKeyView, escape: Bool) in
        view.escapeEnabled = escape
      }
    }
  }
}

/// Offers Command-F while `active`, listed as "Find chat" in what iPadOS
/// draws while Command is held, and Esc while the search field inside has
/// focus.
///
/// UIKit collects `keyCommands` from the first responder up through its
/// superviews to the window, as `SubmitShortcutView` relies on. With the
/// search field or the composer focused, this container is on that path. With
/// nothing focused there is no path at all, so this view becomes the first
/// responder itself, but only then: `EscapeKeyView` takes focus from whoever
/// holds it and hands it back; this one never takes it from anything. It
/// claims focus when it lands in a window, when `active` turns on, and after
/// a text field, a text view or the keyboard lets go of focus, each time on
/// the next run loop pass and only if nobody holds focus by then (moving from
/// one field to another lets go and takes in the same pass). A field that
/// becomes first responder takes it from this view as from any other, and it
/// claims again when that field lets go.
///
/// It is not a text input, so holding focus raises no software keyboard; with
/// a hardware keyboard nothing shows at all.
///
/// Command-F wants priority over the system's: a focused text view has a Find
/// of its own, and the chat search is what a person here means.
///
/// Esc is offered only while a text field inside this view is the first
/// responder and JS says it is the search field (`escape`). The layout card's
/// `EscapeKeyView` holds focus itself while it is pinned, so no field here
/// has it and its Esc closes the card; when the card hands focus back to this
/// view, Command-F is live again at once.
final class FindKeyView: ExpoView {
  let onFind = EventDispatcher()
  let onEscape = EventDispatcher()

  var active = false {
    didSet {
      guard active != oldValue else { return }
      if active {
        claimWhenFree()
      } else if isFirstResponder {
        resignFirstResponder()
      }
    }
  }

  var escapeEnabled = false

  private lazy var find: UIKeyCommand = {
    let command = UIKeyCommand(title: "Find chat", action: #selector(findPressed), input: "f", modifierFlags: .command)
    command.wantsPriorityOverSystemBehavior = true
    return command
  }()

  private lazy var escape: UIKeyCommand = {
    // No title: Esc is a key, not a shortcut worth listing.
    let command = UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escapePressed))
    command.wantsPriorityOverSystemBehavior = true
    return command
  }()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // From any field in the app, not only those inside this view: whichever
    // let go, what follows asks whether anybody holds focus now.
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(focusLetGo), name: UITextField.textDidEndEditingNotification, object: nil)
    center.addObserver(self, selector: #selector(focusLetGo), name: UITextView.textDidEndEditingNotification, object: nil)
    center.addObserver(self, selector: #selector(focusLetGo), name: UIResponder.keyboardDidHideNotification, object: nil)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  override var canBecomeFirstResponder: Bool { active }

  override var keyCommands: [UIKeyCommand]? {
    guard active else { return [] }
    var commands = [find]
    if escapeEnabled, let field = herdrFirstResponderInside(), field !== self, field is UITextInput {
      commands.append(escape)
    }
    return commands
  }

  override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    if newWindow == nil, isFirstResponder { resignFirstResponder() }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    claimWhenFree()
  }

  /// Becomes the first responder after this pass, if still active, in a
  /// window, and nobody else holds focus. A view becomes first responder only
  /// once it is in a window, and props arrive before it is.
  private func claimWhenFree() {
    guard active else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self, self.active, self.window != nil, !self.isFirstResponder, Self.focusIsFree else { return }
      self.becomeFirstResponder()
    }
  }

  /// Nothing holds focus. With no first responder, an action sent to nil can
  /// still land on the window or the app at the end of the chain; neither is
  /// focus.
  private static var focusIsFree: Bool {
    guard let holder = UIResponder.herdrCurrentFirstResponder() else { return true }
    if holder is UIWindow { return true }
    return !(holder is UIView || holder is UIViewController)
  }

  @objc private func focusLetGo() {
    claimWhenFree()
  }

  @objc private func findPressed() {
    onFind([:])
  }

  @objc private func escapePressed() {
    onEscape([:])
  }
}
