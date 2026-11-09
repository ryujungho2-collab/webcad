import { useState } from "react";
import { answerPlanningQuestions, type PlanningClarification } from "./copilotPlanning";

export function CopilotQuestions({ clarification, prompt, disabled, onContinue, onCancel }: { clarification: PlanningClarification; prompt: string; disabled: boolean; onContinue: (prompt: string) => void; onCancel: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({}), [error, setError] = useState("");
  return <section aria-label="Copilot clarification" className="inspector-notice">
    <p role="status">{clarification.summary}</p>
    <p className="property-hint">필수 정보 확인 단계입니다. 답변 후 새 미리보기를 검토하며, Apply 전에는 도면을 변경하지 않습니다.</p>
    <form onSubmit={event => { event.preventDefault(); try { onContinue(answerPlanningQuestions(prompt, clarification, answers)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>
      {clarification.questions.map(q => <fieldset key={q.id} disabled={disabled}>
        <legend>{q.prompt}</legend>
        {q.options.map(option => <button key={option} type="button" aria-pressed={answers[q.id] === option} onClick={() => setAnswers({ ...answers, [q.id]: option })}>{option}</button>)}
        <input aria-label={`Answer ${q.id}`} value={answers[q.id] ?? ""} maxLength={500} placeholder={clarification.recipe ? "숫자 (길이 기본 단위 mm)" : "직접 답변"} onChange={event => { setError(""); setAnswers({ ...answers, [q.id]: event.target.value }); }} />
      </fieldset>)}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={disabled || clarification.questions.some(q => !answers[q.id]?.trim())}>답변으로 계획 계속</button>
      <button type="button" onClick={onCancel} disabled={disabled}>질문 취소</button>
    </form>
  </section>;
}
