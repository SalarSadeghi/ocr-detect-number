import type { SavedNumber } from "../types";

type SavedNumbersListProps = {
  numbers: SavedNumber[];
  onDelete: (id: string) => void;
};

export function SavedNumbersList({
  numbers,
  onDelete,
}: SavedNumbersListProps) {
  return (
    <section className="saved-section" aria-labelledby="saved-title">
      <div className="section-heading">
        <h2 id="saved-title">اعداد ذخیره‌شده</h2>
        <span>{numbers.length.toLocaleString("fa-IR")} مورد</span>
      </div>
      {numbers.length === 0 ? (
        <p className="empty-state">هنوز عددی ذخیره نشده است.</p>
      ) : (
        <ul className="saved-list">
          {numbers.map((item) => (
            <li key={item.id}>
              <div>
                <strong dir="ltr">{item.value}</strong>
                <time dateTime={item.savedAt}>
                  {new Intl.DateTimeFormat("fa-IR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.savedAt))}
                </time>
              </div>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                aria-label={`حذف عدد ${item.value}`}
              >
                حذف
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
