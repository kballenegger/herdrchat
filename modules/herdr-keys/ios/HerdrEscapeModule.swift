import ExpoModulesCore
import UIKit

/// Esc on a hardware keyboard, for a floating card that closes on it (a
/// workspace's layout on iPad). A module of its own rather than a second view
/// in `HerdrKeys`, so the composer's view and how JS finds it are untouched.
public class HerdrEscapeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HerdrEscape")

    View(EscapeKeyView.self) {
      Events("onEscape", "onFind")

      Prop("active") { (view: EscapeKeyView, active: Bool) in
        view.active = active
      }

      // Also offer Command-F ("Find chat") while active.
      Prop("find") { (view: EscapeKeyView, find: Bool) in
        view.findEnabled = find
      }
    }
  }
}

/// Offers Esc while `active`, by becoming the first responder.
///
/// UIKit looks for key commands from the first responder up to the window,
/// and with nothing focused there is no responder on that path at all, so a
/// command on a plain container is never asked. This view takes first
/// responder while active, which takes focus from a text field (the composer
/// beside the list, on iPad), and hands it back to whatever held it when it
/// stops being active or leaves the window: someone typing who glanced at a
/// layout goes on typing without tapping the field again.
///
/// With `find`, it offers Command-F too, listed as "Find chat". The layout
/// card floats in a full-window overlay attached to the window itself, not
/// under the chats screen's `FindKeyView`, so while the card holds focus that
/// view is not on the chain and would never hear the key. Command-F lets go
/// of focus without handing it back (the search field is about to take it,
/// and handing it to the composer first would race that) and says `onFind`.
final class EscapeKeyView: ExpoView {
  let onEscape = EventDispatcher()
  let onFind = EventDispatcher()

  var findEnabled = false

  var active = false {
    didSet { claimFocus() }
  }

  private lazy var escape: UIKeyCommand = {
    let command = UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escapePressed))
    command.wantsPriorityOverSystemBehavior = true
    return command
  }()

  override var canBecomeFirstResponder: Bool { active }

  private lazy var find: UIKeyCommand = {
    let command = UIKeyCommand(title: "Find chat", action: #selector(findPressed), input: "f", modifierFlags: .command)
    command.wantsPriorityOverSystemBehavior = true
    return command
  }()

  override var keyCommands: [UIKeyCommand]? {
    guard active else { return [] }
    return findEnabled ? [escape, find] : [escape]
  }

  /// What had focus before this view took it, to hand it back.
  private weak var previous: UIResponder?

  override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    // Closed by unmounting, still active: UIKit would resign it on the way
    // out and hand focus to nobody.
    if newWindow == nil { giveBack() }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    claimFocus()
  }

  private func claimFocus() {
    if active {
      // After this layout pass: a view becomes first responder only once it
      // is in a window, and props arrive before it is.
      DispatchQueue.main.async { [weak self] in
        guard let self, self.active, self.window != nil, !self.isFirstResponder else { return }
        let holder = UIResponder.herdrCurrentFirstResponder()
        if holder !== self { self.previous = holder }
        self.becomeFirstResponder()
      }
    } else {
      giveBack()
    }
  }

  private func giveBack() {
    let holder = previous
    previous = nil
    guard isFirstResponder else { return }
    resignFirstResponder()
    // Only to a view still on screen: a thread that closed meanwhile is gone.
    if let view = holder as? UIView, view.window != nil {
      view.becomeFirstResponder()
    }
  }

  @objc private func escapePressed() {
    onEscape([:])
  }

  @objc private func findPressed() {
    previous = nil
    if isFirstResponder { resignFirstResponder() }
    onFind([:])
  }
}
