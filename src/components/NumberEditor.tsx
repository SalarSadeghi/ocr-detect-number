type NumberEditorProps = {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
};

export function NumberEditor({
  value,
  disabled,
  onChange,
  onSave,
}: NumberEditorProps) {
  return (
    <>
      <div className="result-panel" aria-live="polite">
        <label className="result-label" htmlFor="detected-number">
          عدد تشخیص‌داده‌شده
        </label>
        <input
          id="detected-number"
          className={value ? "has-result" : ""}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          readOnly={disabled}
          value={value}
          placeholder="—"
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="scan-status">
          {value ? "عدد را بررسی یا ویرایش کنید" : "هنوز عددی تشخیص داده نشده است"}
        </span>
      </div>
      <button
        className="save-button"
        type="button"
        onClick={onSave}
        disabled={!value || disabled}
      >
        ذخیرهٔ عدد
      </button>
    </>
  );
}
