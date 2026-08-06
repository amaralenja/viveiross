export function useTutorial() {
  return { openTutorial: (videoId: string, label: string) => {
    const ev = new CustomEvent("tutorial:open", { detail: { videoId, label } });
    window.dispatchEvent(ev);
  }};
}
