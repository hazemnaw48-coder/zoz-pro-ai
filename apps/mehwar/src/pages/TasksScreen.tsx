import { useCallback, useEffect, useMemo, useState } from "react";
import { createAgentBridge, type TenantTask } from "../api/agentBridge";
import { getSupabaseClient } from "../lib/supabase";

type TasksScreenProps = {
  organizationId: string;
  workspaceId?: string;
};

type LoadState = "loading" | "success" | "error";

// These values match the CHECK constraint on public.zoz_tenant_tasks.status.
const statusLabels: Record<string, string> = {
  queued: "في قائمة الانتظار",
  running: "قيد التنفيذ",
  completed: "مكتملة",
  blocked: "متوقفة لحين استكمال المتطلبات",
  failed: "تعذّر التنفيذ",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * Read-only task list wired to the verified Preview tenant API.
 * Priority/progress filters are intentionally absent because those fields
 * are not part of the currently verified TenantTask response contract.
 */
export default function TasksScreen({
  organizationId,
  workspaceId,
}: TasksScreenProps) {
  const [tasks, setTasks] = useState<TenantTask[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const loadTasks = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage("");

    try {
      const api = createAgentBridge(getSupabaseClient());
      const response = await api.listTasks(organizationId, workspaceId);
      setTasks(response.tasks ?? []);
      setLoadState("success");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "تعذر تحميل قائمة المهام.",
      );
      setLoadState("error");
    }
  }, [organizationId, workspaceId]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const availableStatuses = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.status))).sort(),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return tasks.filter((task) => {
      const matchesStatus = status === "all" || task.status === status;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        task.title.toLocaleLowerCase().includes(normalizedQuery) ||
        task.id.toLocaleLowerCase().includes(normalizedQuery) ||
        task.task_type.toLocaleLowerCase().includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [tasks, query, status]);

  return (
    <main
      dir="rtl"
      lang="ar"
      data-testid="tasks-screen"
      aria-labelledby="tasks-heading"
    >
      <header>
        <p>مِحور | MEHWAR</p>
        <h1 id="tasks-heading">المهام والطلبات</h1>
        <p>تابع حالة الطلبات المسجلة في مساحة شركتك.</p>
      </header>

      <section aria-label="البحث والتصفية">
        <label htmlFor="tasks-search">ابحث في المهام</label>
        <input
          id="tasks-search"
          data-testid="tasks-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="اسم المهمة أو رقمها أو نوعها"
        />

        <label htmlFor="tasks-status-filter">تصفية حسب الحالة</label>
        <select
          id="tasks-status-filter"
          data-testid="tasks-status-filter"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">كل الحالات</option>
          {availableStatuses.map((value) => (
            <option key={value} value={value}>
              {statusLabels[value] ?? value}
            </option>
          ))}
        </select>
      </section>

      {loadState === "loading" && (
        <p role="status" aria-live="polite">
          جارٍ تحميل المهام…
        </p>
      )}

      {loadState === "error" && (
        <section role="alert" data-testid="tasks-error">
          <p>{errorMessage}</p>
          <button
            type="button"
            data-testid="tasks-retry"
            onClick={() => void loadTasks()}
          >
            إعادة المحاولة
          </button>
        </section>
      )}

      {loadState === "success" && filteredTasks.length === 0 && (
        <section data-testid="tasks-empty">
          <h2>لا توجد مهام مطابقة</h2>
          <p>
            {tasks.length === 0
              ? "لم تُسجّل مهام في مساحة العمل بعد."
              : "جرّب تغيير عبارة البحث أو حالة المهمة."}
          </p>
        </section>
      )}

      {loadState === "success" && filteredTasks.length > 0 && (
        <section aria-label="قائمة المهام" data-testid="tasks-list">
          <p aria-live="polite">عدد النتائج: {filteredTasks.length}</p>
          <ul>
            {filteredTasks.map((task) => (
              <li key={task.id} data-testid={`task-row-${task.id}`}>
                <article>
                  <h2>{task.title}</h2>
                  <p>نوع الطلب: {task.task_type}</p>
                  <p>الحالة: {statusLabels[task.status] ?? task.status}</p>
                  <p>تاريخ الإنشاء: {formatDate(task.created_at)}</p>
                  {task.completed_at && (
                    <p>تاريخ الإكمال: {formatDate(task.completed_at)}</p>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
