import { fitPrintDocuments } from "./fitPrintDocuments";
import { fitProductNames } from "./fitProductNames";

/** Apply print layout only while printing; restore the interactive form afterwards. */
export function installAutomaticPrintFit(target: Window) {
  let restore: (() => void) | undefined;
  target.addEventListener("beforeprint", () => {
    restore?.();
    const doc = target.document;
    const originalStyles = Array.from(doc.querySelectorAll<HTMLElement>("*")).map(element => [element, element.getAttribute("style")] as const);
    restore = () => {
      for (const wrapper of Array.from(doc.querySelectorAll<HTMLElement>("[data-auto-fit-wrapper]")).reverse()) wrapper.replaceWith(...Array.from(wrapper.childNodes));
      for (const [element, style] of originalStyles) {
        if (style === null) element.removeAttribute("style"); else element.setAttribute("style", style);
        delete element.dataset.printFitScale;
      }
      restore = undefined;
    };
    fitPrintDocuments(doc);
    fitProductNames(doc);
    fitPrintDocuments(doc);
  });
  target.addEventListener("afterprint", () => restore?.());
}
