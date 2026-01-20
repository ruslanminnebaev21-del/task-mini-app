// app/recipes/@modal/newRecipe/page.tsx

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../recipes.module.css";
import { IconTrash, IconPlus, IconImage } from "@/app/components/icons";

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/* ===== types ===== */

type Ingredient = {
  id: string;
  name: string;
};

type Step = {
  id: string;
  text: string;
};
type Category = {
  id: string;
  title: string;
};

type PhotoState = { file: File; url: string };

/* ===== helpers ===== */

function makeIngredient(): Ingredient {
  return { id: uid(), name: "" };
}

function makeStep(): Step {
  return { id: uid(), text: "" };
}

/* ===== autosize textarea ===== */

function useAutosizeTextareas(values: string[]) {
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const setRef = (id: string) => (el: HTMLTextAreaElement | null) => {
    refs.current[id] = el;
  };

  const resizeOne = (id: string) => {
    const el = refs.current[id];
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    Object.keys(refs.current).forEach(resizeOne);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.join("\n__SEP__\n")]);

  return { setRef, resizeOne };
}

/* ===== page ===== */

export default function NewRecipePage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  /* categories */
  const ALL_CATEGORIES: Category[] = [
    { id: "breakfast", title: "Завтраки" },
    { id: "lunch", title: "Обеды" },
    { id: "dinner", title: "Ужины" },
    { id: "dessert", title: "Десерты" },
    { id: "snack", title: "Перекусы" },
  ];

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [draftCategoryIds, setDraftCategoryIds] = useState<string[]>([]);
  const selectedCategories = ALL_CATEGORIES.filter((c) =>
    selectedCategoryIds.includes(c.id)
  );
  /* basic fields */
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [portions, setPortions] = useState("");

  /* ===== time blocks ===== */

  const [prepOpen, setPrepOpen] = useState(false);
  const [cookOpen, setCookOpen] = useState(false);

  const [prepTime, setPrepTime] = useState({ d: "", h: "", m: "" });
  const [cookTime, setCookTime] = useState({ d: "", h: "", m: "" });

  function formatTime(t: { d: string; h: string; m: string }) {
    const parts: string[] = [];
    if (t.d) parts.push(`${t.d} д`);
    if (t.h) parts.push(`${t.h} ч`);
    if (t.m) parts.push(`${t.m} мин`);
    return parts.join(" ");
  }
  // алиасы под модалку
  const catModalOpen = categoriesOpen;
  const setCatModalOpen = setCategoriesOpen;

  const CATEGORIES = ALL_CATEGORIES.map((c) => ({
    id: c.id,
    name: c.title,
  }));

  const draftCatIds = draftCategoryIds;

  function toggleDraftCat(id: string) {
    toggleDraftCategory(id);
  }

  function saveCats() {
    saveCategories();
  }

  /* recipe photo */
  const [recipePhoto, setRecipePhoto] = useState<PhotoState | null>(null);
  const recipeFileRef = useRef<HTMLInputElement | null>(null);

  /* ingredients */
  const [ingredients, setIngredients] = useState<Ingredient[]>([makeIngredient()]);

  /* steps */
  const [steps, setSteps] = useState<Step[]>([makeStep()]);

  /* step photos */
  const [stepPhotos, setStepPhotos] = useState<Record<string, PhotoState | null>>({});
  const stepFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { setRef: setStepTaRef, resizeOne: resizeStepTa } = useAutosizeTextareas(
    steps.map((s) => s.text)
  );

  useEffect(() => {
    requestAnimationFrame(() => setOpen(true));
  }, []);

  // cleanup urls on unmount
  useEffect(() => {
    return () => {
      if (recipePhoto?.url) URL.revokeObjectURL(recipePhoto.url);
      Object.values(stepPhotos).forEach((p) => {
        if (p?.url) URL.revokeObjectURL(p.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setOpen(false);
    setTimeout(() => router.back(), 220);
  };

  /* ===== ingredients ===== */

  function updateIngredient(id: string, value: string) {
    setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, name: value } : i)));
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, makeIngredient()]);
  }

  function removeIngredient(id: string) {
    setIngredients((prev) => {
      const next = prev.filter((i) => i.id !== id);
      return next.length ? next : [makeIngredient()];
    });
  }

  /* ===== steps ===== */

  function updateStep(id: string, value: string) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, text: value } : s)));
  }

  function addStep() {
    const next = makeStep();
    setSteps((prev) => [...prev, next]);

    requestAnimationFrame(() => resizeStepTa(next.id));
  }

  function removeStep(id: string) {
    // remove photo url if exists
    setStepPhotos((prev) => {
      const cur = prev[id];
      if (cur?.url) URL.revokeObjectURL(cur.url);
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    delete stepFileRefs.current[id];

    setSteps((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next.length ? next : [makeStep()];
    });
  }

  /* ===== photo helpers ===== */

  function pickRecipePhoto() {
    recipeFileRef.current?.click();
  }

  function onRecipePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setRecipePhoto((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { file, url: URL.createObjectURL(file) };
    });

    e.target.value = "";
  }

  function clearRecipePhoto() {
    setRecipePhoto((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  function setStepFileRef(stepId: string) {
    return (el: HTMLInputElement | null) => {
      stepFileRefs.current[stepId] = el;
    };
  }

  function pickStepPhoto(stepId: string) {
    stepFileRefs.current[stepId]?.click();
  }

  function onStepPhotoChange(stepId: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setStepPhotos((prev) => {
        const old = prev[stepId];
        if (old?.url) URL.revokeObjectURL(old.url);
        return { ...prev, [stepId]: { file, url: URL.createObjectURL(file) } };
      });

      e.target.value = "";
    };
  }

  function clearStepPhoto(stepId: string) {
    setStepPhotos((prev) => {
      const old = prev[stepId];
      if (old?.url) URL.revokeObjectURL(old.url);
      return { ...prev, [stepId]: null };
    });
  }

  /* ===== small inline styles for 64x64 preview (no filename) ===== */

  const photoBoxStyle: React.CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.55)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 1px 0 rgba(255,255,255,0.75) inset, 0 10px 20px rgba(0,0,0,0.04)",
  };

  const photoImgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  };

  const photoClearBtnStyle: React.CSSProperties = {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.75)",
    display: "grid",
    placeItems: "center",
    fontSize: 13,
    lineHeight: 1,
  };
  function openCategories() {
    setDraftCategoryIds(selectedCategoryIds);
    setCategoriesOpen(true);
  }

  function toggleDraftCategory(id: string) {
    setDraftCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function saveCategories() {
    setSelectedCategoryIds(draftCategoryIds);
    setCategoriesOpen(false);
  }

  function cancelCategories() {
    setCategoriesOpen(false);
  }

  return (
    <>
      {/* overlay */}
      <div className={`${open ? styles.sheetOverlayOpen : ""}`} onClick={close} />

      {/* sheet */}
      <div className={`${styles.sheet} ${open ? styles.sheetOpen : styles.sheetClosed}`}>
        {/* header */}
        <div className={styles.sheetHeader}>
          <button className={styles.sheetIconBtn} onClick={close} aria-label="Закрыть">
            ✕
          </button>
          <button
            className={`${styles.sheetIconBtn} ${styles.sheetIconBtnDisabled}`}
            disabled
            aria-label="Сохранить"
          >
            ✓
          </button>
        </div>

        {/* content */}
        <div className={styles.sheetContent}>
          {/* title */}
          <input
            className={`${styles.input} ${styles.inputRecipes}`}
            placeholder="Название"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* recipe photo 64x64 */}
          <div className={styles.addRow} style={{ justifyContent: "flex-start" }}>
            <input
              ref={recipeFileRef}
              type="file"
              accept="image/*"
              onChange={onRecipePhotoChange}
              style={{ display: "none" }}
            />

            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={pickRecipePhoto}
                aria-label="Фото рецепта"
                title="Фото рецепта"
                style={{ ...photoBoxStyle, padding: 0, cursor: "pointer" }}
              >
                {recipePhoto ? (
                  <img src={recipePhoto.url} alt="Фото рецепта" style={photoImgStyle} />
                ) : (
                  <IconImage size={20} />
                )}
              </button>

              {recipePhoto ? (
                <button
                  type="button"
                  onClick={clearRecipePhoto}
                  aria-label="Удалить фото рецепта"
                  title="Удалить"
                  style={photoClearBtnStyle}
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>

          {/* url */}
          <input
            className={`${styles.input} ${styles.inputRecipes}`}
            placeholder="URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />

          {/* portions */}
          <input
            className={`${styles.input} ${styles.inputRecipes}`}
            placeholder="Количество порций"
            value={portions}
            onChange={(e) => setPortions(e.target.value)}
          />
          {/* ===== CATEGORIES ===== */}
          <button
            type="button"
            className={styles.card}
            onClick={openCategories}
            style={{ textAlign: "left" }}
          >
            <div className={styles.titleText}>Категории</div>

            {selectedCategories.length > 0 && (
              <div className={styles.metaRow} style={{ marginTop: 10 }}>
                {selectedCategories.map((cat) => (
                  <span key={cat.id} className={styles.chip}>
                    {cat.title}
                  </span>
                ))}
              </div>
            )}
          </button>
          {catModalOpen && (
            <div
              className={styles.modalOverlay}
              onClick={() => setCatModalOpen(false)}
            >
              <div
                className={styles.modalBox}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.modalTitle}>Категории</div>

                <div className={styles.list}>
                  {CATEGORIES.map((c) => {
                    const checked = draftCatIds.includes(c.id);

                    return (
                      <button
                        key={c.id}
                        className={styles.listItemBtn}
                        onClick={() => toggleDraftCat(c.id)}
                      >
                        <span className={styles.titleText}>{c.name}</span>
                        <span style={{ opacity: checked ? 1 : 0.2 }}>✓</span>
                      </button>
                    );
                  })}
                </div>

                <div className={styles.modalActions} style={{ marginTop: 14 }}>
                  <button
                    className={`${styles.modalBtn} ${styles.modalCancel}`}
                    onClick={() => setCatModalOpen(false)}
                  >
                    Отмена
                  </button>

                  <button
                    className={`${styles.modalBtn} ${styles.modalDelete}`}
                    onClick={saveCats}
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            </div>
          )} 

          {/* ===== TIME: PREP ===== */}
          <div className={styles.card}>
            <button
              type="button"
              onClick={() => setPrepOpen((v) => !v)}
              style={{ display: "flex", justifyContent: "space-between", width: "100%" }}
            >
              <span className={styles.titleText}>Время подготовки</span>
              {formatTime(prepTime) && (
                <span style={{ whiteSpace: "nowrap", lineHeight: "1", color: "rgb(17 17 17 / 36%)" }}>
                  {formatTime(prepTime)}
                </span>
              )}
            </button>

            {prepOpen && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input
                  className={styles.input}
                  placeholder="д"
                  value={prepTime.d}
                  onChange={(e) =>
                    setPrepTime({ ...prepTime, d: e.target.value.replace(/\D/g, "") })
                  }
                />
                <input
                  className={styles.input}
                  placeholder="ч"
                  value={prepTime.h}
                  onChange={(e) =>
                    setPrepTime({ ...prepTime, h: e.target.value.replace(/\D/g, "") })
                  }
                />
                <input
                  className={styles.input}
                  placeholder="м"
                  value={prepTime.m}
                  onChange={(e) =>
                    setPrepTime({ ...prepTime, m: e.target.value.replace(/\D/g, "") })
                  }
                />
              </div>
            )}
          </div>

          {/* ===== TIME: COOK ===== */}
          <div className={styles.card}>
            <button
              type="button"
              onClick={() => setCookOpen((v) => !v)}
              style={{ display: "flex", justifyContent: "space-between", width: "100%" }}
            >
              <span className={styles.titleText}>Время приготовления</span>
              {formatTime(cookTime) && (
                <span style={{ whiteSpace: "nowrap", lineHeight: "1", color: "rgb(17 17 17 / 36%)"}}>
                  {formatTime(cookTime)}
                </span>
              )}
            </button>

            {cookOpen && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input
                  className={styles.input}
                  placeholder="д"
                  value={cookTime.d}
                  onChange={(e) =>
                    setCookTime({ ...cookTime, d: e.target.value.replace(/\D/g, "") })
                  }
                />
                <input
                  className={styles.input}
                  placeholder="ч"
                  value={cookTime.h}
                  onChange={(e) =>
                    setCookTime({ ...cookTime, h: e.target.value.replace(/\D/g, "") })
                  }
                />
                <input
                  className={styles.input}
                  placeholder="м"
                  value={cookTime.m}
                  onChange={(e) =>
                    setCookTime({ ...cookTime, m: e.target.value.replace(/\D/g, "") })
                  }
                />
              </div>
            )}
          </div>

          {/* ===== INGREDIENTS ===== */}
          <div className={styles.sectionTitle}>Ингредиенты</div>
          <div className={styles.card}>
            <div className={styles.formGrid}>
              {ingredients.map((ing) => (
                <div key={ing.id} className={styles.listItemRec}>
                  <input
                    className={`${styles.input} ${styles.inputRecipes}`}
                    placeholder="Ингредиент"
                    value={ing.name}
                    onChange={(e) => updateIngredient(ing.id, e.target.value)}
                  />

                  <button
                    type="button"
                    className={styles.trashBtn}
                    onClick={() => removeIngredient(ing.id)}
                    aria-label="Удалить ингредиент"
                    title="Удалить"
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button type="button" className={styles.bigCtaRec} onClick={addIngredient}>
              <span className={styles.bigCtaRecText}>
                Добавить
              </span>
            </button>
          </div>

          {/* ===== STEPS ===== */}
          <div className={styles.sectionTitle}>Шаги</div>
          <div className={styles.card}>
            <div className={styles.formGrid}>
              <div className={styles.gridSteps}>
                {steps.map((step, idx) => {
                  const photo = stepPhotos[step.id] ?? null;

                  return (
                    <div key={step.id} className={styles.stepRow}>
                      <div className={styles.stepMain}>
                        <textarea
                          ref={setStepTaRef(step.id)}
                          className={styles.textareaRec}
                          placeholder={`Шаг ${idx + 1}. Что делаем?`}
                          value={step.text}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateStep(step.id, v);
                            requestAnimationFrame(() => resizeStepTa(step.id));
                          }}
                          onInput={() => requestAnimationFrame(() => resizeStepTa(step.id))}
                          rows={1}
                        />

                        {/* step photo 64x64 */}
                        <div className={styles.addRow} style={{ justifyContent: "flex-start" }}>
                          <input
                            ref={setStepFileRef(step.id)}
                            type="file"
                            accept="image/*"
                            onChange={onStepPhotoChange(step.id)}
                            style={{ display: "none" }}
                          />

                          <div style={{ position: "relative" }}>
                            <button
                              type="button"
                              onClick={() => pickStepPhoto(step.id)}
                              aria-label={`Фото шага ${idx + 1}`}
                              title="Фото шага"
                              style={{ ...photoBoxStyle, padding: 0, cursor: "pointer" }}
                            >
                              {photo ? (
                                <img src={photo.url} alt={`Фото шага ${idx + 1}`} style={photoImgStyle} />
                              ) : (
                                <IconImage size={20} />
                              )}
                            </button>

                            {photo ? (
                              <button
                                type="button"
                                onClick={() => clearStepPhoto(step.id)}
                                aria-label={`Удалить фото шага ${idx + 1}`}
                                title="Удалить"
                                style={photoClearBtnStyle}
                              >
                                ✕
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={styles.stepTrashBtn}
                        onClick={() => removeStep(step.id)}
                        aria-label="Удалить шаг"
                        title="Удалить"
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <button type="button" className={styles.bigCtaRec} onClick={addStep}>
              <span className={styles.bigCtaRecText}>Добавить шаг</span>
            </button>
          </div>
        </div>
      </div>
      
    </>
  );
}