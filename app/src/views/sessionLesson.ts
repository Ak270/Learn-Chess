import { mountLesson } from '../components/LessonViewer';
import { lessonById } from '../core/content/lessons';

/** Small bridge so the session can embed a lesson without importing the whole Learn view. */
export function LessonViewerHost(host: HTMLElement, id: string, onDone: () => void) {
  const l = lessonById(id);
  if (!l) {
    host.innerHTML = '<p>That lesson is missing.</p>';
    return;
  }
  mountLesson(host, l, { onDone });
}
