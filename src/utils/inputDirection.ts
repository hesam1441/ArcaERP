export type InputDirection = 'ltr' | 'rtl';

/** Numbers and punctuation are neutral: find the first actual letter/script. */
export function detectInputDirection(value: string, fallback: InputDirection = 'rtl'): InputDirection {
  for (const character of value) {
    if (!/\p{Letter}/u.test(character)) continue;
    return /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(character) ? 'rtl' : 'ltr';
  }
  return /\p{Number}/u.test(value) ? 'ltr' : fallback;
}

/** One installation covers React forms, portals, table editors and late mounts.
 * Only presentation attributes change; values, selection and DOM text stay intact.
 * A field can opt into a fixed direction with data-input-direction="ltr|rtl",
 * or an editor subtree can opt out with data-input-direction="off".
 */
export function installInputDirection(document: Document): () => void {
  const selector = 'input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"]';
  const composing = new WeakSet<Element>();
  const managed = new Map<HTMLElement, { dir: string | null; marker: string | null }>();
  const apply = (element: HTMLElement) => {
    if (element.closest('[data-input-direction="off"]') || composing.has(element)) return;
    const input = element instanceof HTMLInputElement;
    if (input && !['text', 'search', 'number', 'email', 'tel', 'url', 'password'].includes(element.type)) return;
    const fixed = element.getAttribute('data-input-direction');
    const original = managed.get(element);
    const explicit = original ? original.dir : element.getAttribute('dir');
    const fallback: InputDirection = explicit === 'ltr' || explicit === 'rtl' ? explicit
      : element.parentElement?.closest('[dir="ltr"],[dir="rtl"]')?.getAttribute('dir') === 'ltr' ? 'ltr' : 'rtl';
    const value = input || element instanceof HTMLTextAreaElement ? element.value : element.textContent || '';
    const direction = fixed === 'ltr' || fixed === 'rtl' ? fixed
      : input && ['number', 'email', 'tel', 'url', 'password'].includes(element.type) ? 'ltr'
      : detectInputDirection(value, fallback);
    if (!original) managed.set(element, { dir: element.getAttribute('dir'), marker: element.getAttribute('data-resolved-input-direction') });
    if (element.getAttribute('dir') !== direction) element.setAttribute('dir', direction);
    if (element.dataset.resolvedInputDirection !== direction) element.dataset.resolvedInputDirection = direction;
  };
  const scan = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (node.matches(selector)) apply(node as HTMLElement);
    node.querySelectorAll<HTMLElement>(selector).forEach(apply);
    const editor = node.closest<HTMLElement>('[contenteditable="true"],[contenteditable="plaintext-only"]');
    if (editor) apply(editor);
  };
  const eventTarget = (event: Event) => {
    const target = event.target;
    return target instanceof HTMLElement ? target.closest<HTMLElement>(selector) : null;
  };
  const update = (event: Event) => { const target = eventTarget(event); if (target) apply(target); };
  const startComposition = (event: Event) => { const target = eventTarget(event); if (target) composing.add(target); };
  const endComposition = (event: Event) => { const target = eventTarget(event); if (target) { composing.delete(target); apply(target); } };
  const updateEditor = (node: Node) => {
    const element = node instanceof Element ? node : node.parentElement;
    const editor = element?.closest<HTMLElement>('[contenteditable="true"],[contenteditable="plaintext-only"]');
    if (editor) apply(editor);
  };
  const observer = new MutationObserver(records => {
    const changed = new Set<Node>();
    let removed = false;
    for (const record of records) {
      if (record.type === 'childList') {
        record.addedNodes.forEach(node => changed.add(node));
        updateEditor(record.target);
        removed ||= record.removedNodes.length > 0;
      } else if (record.type === 'characterData') {
        updateEditor(record.target);
      } else {
        // Value updates affect only this control, not its entire form.
        if (record.attributeName === 'dir' || record.attributeName === 'data-input-direction') changed.add(record.target);
        else if (record.target instanceof HTMLElement) apply(record.target);
      }
    }
    for (const node of changed) {
      if (![...changed].some(parent => parent !== node && parent.contains(node))) scan(node);
    }
    if (removed) for (const element of managed.keys()) if (!element.isConnected) managed.delete(element);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['value', 'dir', 'contenteditable', 'data-input-direction'] });
  scan(document.documentElement);
  for (const type of ['input', 'change', 'focusin']) document.addEventListener(type, update, true);
  document.addEventListener('compositionstart', startComposition, true);
  document.addEventListener('compositionend', endComposition, true);
  return () => {
    observer.disconnect();
    for (const type of ['input', 'change', 'focusin']) document.removeEventListener(type, update, true);
    document.removeEventListener('compositionstart', startComposition, true);
    document.removeEventListener('compositionend', endComposition, true);
    for (const [element, original] of managed) {
      if (original.dir === null) element.removeAttribute('dir'); else element.setAttribute('dir', original.dir);
      if (original.marker === null) element.removeAttribute('data-resolved-input-direction'); else element.setAttribute('data-resolved-input-direction', original.marker);
    }
    managed.clear();
  };
}
