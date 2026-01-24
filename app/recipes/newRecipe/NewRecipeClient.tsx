// app/recipes/newRecipe/page.tsx

"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "../recipes.module.css";
import { IconTrash, IconPlus, IconImage } from "@/app/components/icons";
import PageFade from "@/app/components/PageFade/PageFade";
import { useSearchParams } from "next/navigation";

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

async function ensureJpeg(file: File): Promise<File> {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();

  const isHeic =
    type.includes("heic") ||
    type.includes("heif") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif");

  if (!isHeic) return file;

  const heic2any = (await import("heic2any")).default;

  const converted = (await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  })) as Blob;

  return new File([converted], `${Date.now()}.jpg`, { type: "image/jpeg" });
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

type PhotoState = { file: File | null; url: string };

type CurRecipeApi = {
  recipe: {
    id: number;
    title: string;
    source_url: string | null;
    portions: string | null;
    prep_time_min: number | null;
    cook_time_min: number | null;

    kcal: number | null;
    b: number | null;
    j: number | null;
    u: number | null;

    photo_url: string | null;
    photo_path: string | null;
  };
  categories: { id: string; title: string }[];
  ingredients: { id: number; pos: number; text: string }[];
  steps: { id: number; pos: number; text: string; photo_url: string | null; photo_path?: string | null }[];
};
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
  const scrollFocusedToTopOffset = useCallback((el: HTMLElement) => {
    // не трогаем клики по кнопкам/чипам и т.п.
    const tag = el.tagName?.toLowerCase();
    if (tag !== "input" && tag !== "textarea") return;

    // если инпут внутри модалки категорий, можно не скроллить (по желанию)
    // if ((el as HTMLElement).closest(`.${styles.modalBox}`)) return;

    const rect = el.getBoundingClientRect();
    const targetTop = 100; // px от верха экрана
    const delta = rect.top - targetTop;

    // уже почти на месте
    if (Math.abs(delta) < 4) return;

    window.scrollBy({ top: delta, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;

      // даём iOS/Android поднять клаву, потом докрутим
      requestAnimationFrame(() => scrollFocusedToTopOffset(el));
      setTimeout(() => scrollFocusedToTopOffset(el), 50);
      setTimeout(() => scrollFocusedToTopOffset(el), 180);
    };

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [scrollFocusedToTopOffset]);
  
  
  /* categories */
  const [ALL_CATEGORIES, setAllCategories] = useState<Category[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [draftCategoryIds, setDraftCategoryIds] = useState<string[]>([]);
  const [newCatTitle, setNewCatTitle] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [catsErr, setCatsErr] = useState<string | null>(null);  
  const selectedCategories = ALL_CATEGORIES.filter((c) =>
    selectedCategoryIds.includes(c.id)
  );
  /* basic fields */
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [portions, setPortions] = useState("");
  const sp = useSearchParams();
  const isEdit = sp.get("edit") === "1";
  const editRecipeId = sp.get("recipe_id");

  /* ===== time blocks ===== */

  const [prepOpen, setPrepOpen] = useState(false);
  const [cookOpen, setCookOpen] = useState(false);

  const [prepTime, setPrepTime] = useState({ d: "", h: "", m: "" });
  const [cookTime, setCookTime] = useState({ d: "", h: "", m: "" });
  const [kbyuOpen, setKbyuOpen] = useState(false);
  const [kbyu, setKbyu] = useState({ kcal: "", b: "", j: "", u: "" });

  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const initialSnapshotRef = useRef<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);


  function normalizeSnapshot() {
    const tTitle = String(title ?? "");
    const tUrl = String(url ?? "");
    const tPortions = String(portions ?? "");

    return JSON.stringify({
      title: tTitle.trim(),
      url: tUrl.trim() ? tUrl.trim() : null,
      portions: tPortions.trim() ? tPortions.trim() : null,
      category_ids: [...selectedCategoryIds].sort(),
      prep_time: prepTime,
      cook_time: cookTime,
      kbyu,
      ingredients: ingredients.map((i) => String(i.name ?? "").trim()).filter(Boolean),
      steps: steps.map((s) => String(s.text ?? "").trim()).filter(Boolean),
      photo_path: recipePhotoPath ?? null,
    });
  }

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
  const [recipePhotoPath, setRecipePhotoPath] = useState<string | null>(null);
  const recipePhotoPathRef = useRef<string | null>(null);
  useEffect(() => {
    recipePhotoPathRef.current = recipePhotoPath;
  }, [recipePhotoPath]);  
  // последний реально загруженный tmp путь (нужен для удаления при замене)
  const tmpLastUploadedPathRef = useRef<string | null>(null);
  // чтобы второй tmp-upload ждал завершения первого и получил old_path
  const tmpUploadPromiseRef = useRef<Promise<void> | null>(null);
  const tmpUploadSeqRef = useRef(0);
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
    let alive = true;

    (async () => {
      try {
        setCatsLoading(true);
        const r = await fetch("/api/recipes/categories", { method: "GET" });
        const j = await r.json();
        if (!alive) return;

        setAllCategories(Array.isArray(j?.categories) ? j.categories : []);
      } catch {
        if (!alive) return;
        setAllCategories([]);
      } finally {
        if (!alive) return;
        setCatsLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []); 
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!isEdit) return;
      if (!editRecipeId) return;

      try {
        const r = await fetch(
          `/api/recipes/curRecipe?view=full&recipe_id=${encodeURIComponent(editRecipeId)}`,
          { method: "GET", cache: "no-store" }
        );
        const j = (await r.json()) as any;
        if (!alive) return;

        if (!r.ok) {
          console.log("EDIT LOAD FAILED:", j?.error ?? "unknown");
          return;
        }

        const data = j as CurRecipeApi;

        // 1) базовые поля
        setTitle(data.recipe?.title ?? "");
        setUrl(data.recipe?.source_url ?? "");
        setPortions(data.recipe?.portions ?? "");

        // 2) категории
        setSelectedCategoryIds((data.categories ?? []).map((c) => String(c.id)));

        // 3) ингредиенты -> твой формат {id, name}
        const nextIngredients = (data.ingredients ?? []).length
          ? (data.ingredients ?? [])
              .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
              .map((x) => ({ id: uid(), name: String(x.text ?? "") }))
          : [makeIngredient()];
        setIngredients(nextIngredients);

        // 4) шаги -> твой формат {id, text}
        const nextSteps = (data.steps ?? []).length
          ? (data.steps ?? [])
              .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
              .map((s) => ({ id: uid(), text: String(s.text ?? "") }))
          : [makeStep()];
        setSteps(nextSteps);

        // 5) фото рецепта (url есть, файла нет)
        if (data.recipe?.photo_url) {
          setRecipePhoto({ file: null, url: String(data.recipe.photo_url) });
          setRecipePhotoPath(data.recipe.photo_path ?? null);
        } else {
          setRecipePhoto(null);
          setRecipePhotoPath(null);
        }

        // 6) время (минуты -> d/h/m)
        function minToParts(totalMin: number | null) {
          const t = Math.max(0, Number(totalMin ?? 0));
          const d = Math.floor(t / 1440);
          const h = Math.floor((t % 1440) / 60);
          const m = t % 60;
          return {
            d: d ? String(d) : "",
            h: h ? String(h) : "",
            m: m ? String(m) : "",
          };
        }

        setPrepTime(minToParts(data.recipe?.prep_time_min ?? null));
        setCookTime(minToParts(data.recipe?.cook_time_min ?? null));
        setKbyu({
          kcal: data.recipe?.kcal != null ? String(data.recipe.kcal) : "",
          b: data.recipe?.b != null ? String(data.recipe.b) : "",
          j: data.recipe?.j != null ? String(data.recipe.j) : "",
          u: data.recipe?.u != null ? String(data.recipe.u) : "",
        });

        // 7) почистим фотки шагов (если ты пока их не подтягиваешь)
        setStepPhotos({});

        // важно: snapshot считаем из ТЕХ ЖЕ локальных данных, что кладём в state
        const snap = JSON.stringify({
          title: String(data.recipe?.title ?? "").trim(),
          url: String(data.recipe?.source_url ?? "").trim() ? String(data.recipe?.source_url ?? "").trim() : null,
          portions: String(data.recipe?.portions ?? "").trim() ? String(data.recipe?.portions ?? "").trim() : null,
          category_ids: (data.categories ?? []).map((c) => String(c.id)).sort(),
          prep_time: minToParts(data.recipe?.prep_time_min ?? null),
          cook_time: minToParts(data.recipe?.cook_time_min ?? null),
          kbyu: {
              kcal: data.recipe?.kcal != null ? String(data.recipe.kcal) : "",
              b: data.recipe?.b != null ? String(data.recipe.b) : "",
              j: data.recipe?.j != null ? String(data.recipe.j) : "",
              u: data.recipe?.u != null ? String(data.recipe.u) : "",
            },          
          ingredients: (data.ingredients ?? [])
            .slice()
            .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
            .map((x) => String(x.text ?? "").trim())
            .filter(Boolean),
          steps: (data.steps ?? [])
            .slice()
            .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
            .map((s) => String(s.text ?? "").trim())
            .filter(Boolean),
          photo_path: data.recipe?.photo_path ?? null,
        });

        initialSnapshotRef.current = snap;      
      } catch (e) {
        console.log("EDIT LOAD ERROR:", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isEdit, editRecipeId]);

  // cleanup urls on unmount
  useEffect(() => {
    return () => {
      if (recipePhoto?.file && recipePhoto?.url) URL.revokeObjectURL(recipePhoto.url);
      Object.values(stepPhotos).forEach((p) => {
        if (p?.url) URL.revokeObjectURL(p.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const onResize = () => {
      // если клавиатура открылась, визуальная высота окна заметно уменьшается
      const isOpen = vv.height < window.innerHeight - 120;
      setKeyboardOpen(isOpen);
    };

    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  useEffect(() => {
    if (isEdit) return;
    initialSnapshotRef.current = normalizeSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  

  const close = (opts?: { skipConfirm?: boolean }) => {
    const skip = !!opts?.skipConfirm;

    if (!skip) {
      const ok = window.confirm("Выйти? Результат не сохранится");
      if (!ok) return;
    }

    if (window.history.length > 1) router.back();
    else router.push("/recipes");
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

  async function onRecipePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const safeFile = file ? await ensureJpeg(file) : null;
    if (!safeFile) return;

    // превью сразу
    setRecipePhoto((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { file: safeFile, url: URL.createObjectURL(safeFile) };
    });

    // ВАЖНО:
    // - если новый рецепт -> не грузим, пока не появится recipe_id (после сохранения)
    // НОВЫЙ рецепт: грузим сразу в tmp и запоминаем photo_path
    if (!isEdit) {
      // если прошлый tmp-upload еще идет — дождемся, чтобы появился recipePhotoPathRef.current
      if (tmpUploadPromiseRef.current) {
        try {
          await tmpUploadPromiseRef.current;
        } catch {
          // игнор
        }
      }

      const mySeq = ++tmpUploadSeqRef.current;

      const run = (async () => {
        try {
          const fd = new FormData();
          fd.append("file", safeFile);
          fd.append("folder", "main");
          fd.append("recipe_id", "tmp");

          // если уже было tmp-фото, просим сервер удалить его
          const old = tmpLastUploadedPathRef.current;
          if (old) fd.append("old_path", old);

          const res = await fetch("/api/recipes/upload", { method: "POST", body: fd });
          const json = await res.json();

          if (json?.ok && json?.photo_path) {
            const p = String(json.photo_path);
            setRecipePhotoPath(p);
            recipePhotoPathRef.current = p;
            tmpLastUploadedPathRef.current = p;
          } else {
            console.log("TMP UPLOAD BAD RESPONSE:", json);
            setRecipePhotoPath(null);
            recipePhotoPathRef.current = null;
          }
        } catch (err) {
          console.log("TMP UPLOAD ERROR:", err);
          setRecipePhotoPath(null);
          recipePhotoPathRef.current = null;
        }
      })();

      tmpUploadPromiseRef.current = run;

      try {
        await run;
      } finally {
        // чистим ref только если это всё ещё последняя загрузка
        if (tmpUploadSeqRef.current === mySeq) {
          tmpUploadPromiseRef.current = null;
        }
      }

      e.target.value = "";
      return;
    }

    // edit режим, но вдруг id нет
    if (!editRecipeId) {
      console.log("UPLOAD SKIP: no editRecipeId");
      setRecipePhotoPath(null);
      e.target.value = "";
      return;
    }

    // грузим сразу, потому что recipe_id уже есть
    try {
      const fd = new FormData();
      fd.append("file", safeFile);
      fd.append("folder", "main");
      fd.append("recipe_id", String(editRecipeId));

      const res = await fetch("/api/recipes/upload", { method: "POST", body: fd });
      const json = await res.json();

      if (json?.ok && json?.photo_path) {
        const p = String(json.photo_path);
        setRecipePhotoPath(p);
        recipePhotoPathRef.current = p;
      } else {
        setRecipePhotoPath(null);
        console.log("UPLOAD BAD RESPONSE:", json);
      }
    } catch (err) {
      setRecipePhotoPath(null);
      console.log("UPLOAD ERROR:", err);
    }

    e.target.value = "";
  }

  function clearRecipePhoto() {
    setRecipePhoto((prev) => {
      if (prev?.file && prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    setRecipePhotoPath(null);
    recipePhotoPathRef.current = null;
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
    return async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const safeFile = file ? await ensureJpeg(file) : null;
      if (!safeFile) return;

      setStepPhotos((prev) => {
        const old = prev[stepId];
        if (old?.url) URL.revokeObjectURL(old.url);
        return { ...prev, [stepId]: { file: safeFile, url: URL.createObjectURL(safeFile) } };
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
  async function onAddCategory() {
    const t = newCatTitle.trim();
    if (!t || addingCat) return;

    try {
      setAddingCat(true);
      setCatsErr(null);

      const r = await fetch("/api/recipes/categories/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t }),
        cache: "no-store",
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Не удалось добавить категорию");

      const created = j?.category as Category | undefined;
      if (!created?.id) throw new Error("Bad response");

      // 1) добавили в общий список
      setAllCategories((prev) => [...prev, created]);

      // 2) сразу выбрали в модалке (галочка)
      setDraftCategoryIds((prev) =>
        prev.includes(String(created.id)) ? prev : [...prev, String(created.id)]
      );

      setNewCatTitle("");
      showToast("Категория добавлена");
    } catch (e: any) {
      setCatsErr(e?.message ?? "Не удалось добавить категорию");
    } finally {
      setAddingCat(false);
    }
  }

  function cancelCategories() {
    setCategoriesOpen(false);
  }
  function onlyDigits(s: string) {
    return String(s ?? "").replace(/\D/g, "");
  }  
  async function handleSave() {
    if (saving) return;
    if (isEdit) {
      if (!editRecipeId) {
        alert("Не найден recipe_id для редактирования");
        return;
      }

      const cur = normalizeSnapshot();
      const base = initialSnapshotRef.current;

      if (!base) {
        initialSnapshotRef.current = cur;
        close({ skipConfirm: true });
        return;
      }

      if (cur === base) {
        close({ skipConfirm: true });
        return;
      }
    }

    const ok = window.confirm("Сохранить рецепт?");
    if (!ok) return;

    setSaving(true);
    try {
      const tTitle = String(title ?? "");
      const tUrl = String(url ?? "");
      const tPortions = String(portions ?? "");
      const apiUrl = isEdit ? "/api/recipes/updateRecipe" : "/api/recipes/newRecipe";
      console.log("SAVE MODE:", { isEdit, editRecipeId, apiUrl });
      const payload = {
        title: tTitle.trim(),
        url: tUrl.trim() ? tUrl.trim() : null,
        portions: tPortions.trim() ? tPortions.trim() : null,
        category_ids: selectedCategoryIds,
        prep_time: prepTime,
        cook_time: cookTime,
        kbyu: {
          kcal: kbyu.kcal.trim() ? Number(kbyu.kcal) : null,
          b: kbyu.b.trim() ? Number(kbyu.b) : null,
          j: kbyu.j.trim() ? Number(kbyu.j) : null,
          u: kbyu.u.trim() ? Number(kbyu.u) : null,
        },        
        ingredients: ingredients.map((i) => String(i.name ?? "").trim()).filter(Boolean),
        steps: steps.map((s) => ({ text: String(s.text ?? "").trim() })).filter((s) => s.text.length > 0),
        photo_path: recipePhotoPath ?? null,
      };
      if (isEdit) {
        (payload as any).recipe_id = Number(editRecipeId);
      }   

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      

      if (!res.ok) {
        alert(json?.error ?? "Ошибка сохранения");
        return;
      }

      const savedRecipeId = isEdit ? Number(editRecipeId) : Number(json?.recipe_id ?? 0);

      // если это новый рецепт и фото выбрано — грузим главное фото после появления recipe_id
      if (!isEdit && savedRecipeId) {
        await uploadMainPhotoAfterSave(savedRecipeId);
      }

      if (json?.ok && savedRecipeId && Array.isArray(json.step_ids)) {
        uploadStepPhotosInBackground(savedRecipeId, json.step_ids);
      }

      showToast("Рецепт сохранён");
      initialSnapshotRef.current = normalizeSnapshot();
      setTimeout(() => close({ skipConfirm: true }), 200);
      console.log("STEPS STATE:", steps);
      console.log("STEP PHOTOS:", stepPhotos);
      console.log("STEP IDS FROM DB:", json.step_ids);

      
    } catch (e) {
      console.log("SAVE ERROR:", e);
      alert("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }  

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }
  async function uploadMainPhotoAfterSave(recipeId: number) {
    const f = recipePhoto?.file;
    if (!f) return;

    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("folder", "main");
      fd.append("recipe_id", String(recipeId));
      // если до этого было tmp-фото — попросим сервер удалить его после успешной загрузки финального
      const old = tmpLastUploadedPathRef.current;
      if (old) fd.append("old_path", old);

      const res = await fetch("/api/recipes/upload", { method: "POST", body: fd });
      const json = await res.json();

      if (json?.ok && json?.photo_path) {
      const p = String(json.photo_path);
      setRecipePhotoPath(p);
      recipePhotoPathRef.current = p;
        // опционально: можно заменить превью на public url, но не обязательно
        // if (json?.photo_url) setRecipePhoto({ file: null, url: String(json.photo_url) });
      } else {
        console.log("MAIN PHOTO UPLOAD BAD RESPONSE:", json);
        setRecipePhotoPath(null);
      }
    } catch (e) {
      console.log("MAIN PHOTO UPLOAD ERROR:", e);
      setRecipePhotoPath(null);
    }
  }
  async function uploadStepPhotosInBackground(
    recipeId: number,
    stepIds: { id: number; pos: number }[]
  ) {
    stepIds.forEach(async ({ id: stepDbId, pos }) => {
      const localStep = steps[pos - 1];
      if (!localStep) return;

      const photo = stepPhotos[localStep.id];
      if (!photo?.file) return;

      try {
        const fd = new FormData();
        fd.append("file", photo.file);
        fd.append("folder", "steps");
        fd.append("recipe_id", String(recipeId));
        fd.append("step_id", String(stepDbId));

        const res = await fetch("/api/recipes/upload", {
          method: "POST",
          body: fd,
        });

        const json = await res.json();
        
      } catch (e) {
        console.log("STEP PHOTO UPLOAD ERROR:", e);
      }
    });
  }

  return (
    <>
    <PageFade>
      {/* overlay */}
      <div className={styles.sheetOverlayOpen} onClick={() => close()} />

      {/* sheet */}
      <div className={styles.sheet}>
        {/* header */}
        <div className={styles.sheetOverlayOpen} onClick={() => close()} />
        <div className={styles.sheetHeader}>
         
          <button className={styles.sheetIconBtn} onClick={() => close()} aria-label="Закрыть">
            ✕
          </button>
          <div style={{ opacity: 0.6, fontSize: 12 }}>
            {isEdit ? "Редактирование" : "Новый рецепт"}
          </div>          
          <button
            className={`${styles.sheetIconBtn} ${(!title.trim() || saving) ? styles.sheetIconBtnDisabled : ""}`}
            disabled={!title.trim() || saving}
            aria-label="Сохранить"
            onClick={handleSave}
          >
            <span className={saving ? styles.iconSpin : undefined}>
              ✓
            </span>
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
            placeholder="Количество порций: "
            value={portions ? `Количество порций: ${portions}` : ""}
            onChange={(e) => {
              const digits = onlyDigits(e.target.value);
              setPortions(digits);
            }}
            inputMode="numeric"
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
                  <div className={styles.categoryAddRowNR}>
                    <input
                      className={`${styles.input} ${styles.inputGrow}`}
                      placeholder="Новая категория"
                      value={newCatTitle}
                      onChange={(e) => setNewCatTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onAddCategory();
                      }}
                    />

                    <button
                      type="button"
                      className={styles.btnCircle}
                      onClick={onAddCategory}
                      aria-label="Добавить категорию"
                      title="Добавить"
                    >
                      <IconPlus size={18} className={addingCat ? styles.iconSpin : undefined} />
                    </button>
                  </div>

                  {catsErr ? (
                    <div style={{ padding: "8px 12px", color: "rgba(180,0,0,0.85)", fontSize: 13 }}>
                      {catsErr}
                    </div>
                  ) : null}                
                {catsLoading ? (
                  <div style={{ padding: 12, opacity: 0.6 }}>Загружаю категории…</div>
                ) : null}
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
                    className={`${styles.modalBtn} ${styles.modalDelete} `}
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
                  className={`${styles.input} ${styles.timeInput}`}
                  placeholder="д"
                  value={prepTime.d}
                  onChange={(e) =>
                    setPrepTime({ ...prepTime, d: e.target.value.replace(/\D/g, "") })
                  }
                />
                <input
                  className={`${styles.input} ${styles.timeInput}`}
                  placeholder="ч"
                  value={prepTime.h}
                  onChange={(e) =>
                    setPrepTime({ ...prepTime, h: e.target.value.replace(/\D/g, "") })
                  }
                />
                <input
                  className={`${styles.input} ${styles.timeInput}`}
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
              <div style={{ display: "flex", gap: 8, marginTop: 12}}>
                <input
                  className={`${styles.input} ${styles.timeInput}`}
                  placeholder="д"
                  value={cookTime.d}
                  onChange={(e) =>
                    setCookTime({ ...cookTime, d: e.target.value.replace(/\D/g, "") })
                  }
                />
                <input
                  className={`${styles.input} ${styles.timeInput}`}
                  placeholder="ч"
                  value={cookTime.h}
                  onChange={(e) =>
                    setCookTime({ ...cookTime, h: e.target.value.replace(/\D/g, "") })
                  }
                />
                <input
                  className={`${styles.input} ${styles.timeInput}`}
                  placeholder="м"
                  value={cookTime.m}
                  onChange={(e) =>
                    setCookTime({ ...cookTime, m: e.target.value.replace(/\D/g, "") })
                  }
                />
              </div>
            )}
          </div>
          {/* ===== KBYU ===== */}
          <div className={styles.card}>
            <button
              type="button"
              onClick={() => setKbyuOpen((v) => !v)}
              style={{ display: "flex", justifyContent: "space-between", width: "100%" }}
            >
              <span className={styles.titleText}>КБЖУ</span>

              {(kbyu.kcal || kbyu.b || kbyu.j || kbyu.u) ? (
                <span style={{ whiteSpace: "nowrap", lineHeight: "1", color: "rgb(17 17 17 / 36%)" }}>
                  {kbyu.kcal ? `${kbyu.kcal} ккал` : "—"} ·
                  {kbyu.b ? ` Б ${kbyu.b}` : " Б —"} ·
                  {kbyu.j ? ` Ж ${kbyu.j}` : " Ж —"} ·
                  {kbyu.u ? ` У ${kbyu.u}` : " У —"}
                </span>
              ) : null}
            </button>

            {kbyuOpen && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input
                  className={`${styles.input} ${styles.timeInput}`}
                  placeholder="ккал"
                  value={kbyu.kcal}
                  onChange={(e) => setKbyu({ ...kbyu, kcal: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                />
                <input
                  className={`${styles.input} ${styles.timeInput}`}
                  placeholder="б"
                  value={kbyu.b}
                  onChange={(e) => setKbyu({ ...kbyu, b: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                />
                <input
                  className={`${styles.input} ${styles.timeInput}`}
                  placeholder="ж"
                  value={kbyu.j}
                  onChange={(e) => setKbyu({ ...kbyu, j: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                />
                <input
                  className={`${styles.input} ${styles.timeInput}`}
                  placeholder="у"
                  value={kbyu.u}
                  onChange={(e) => setKbyu({ ...kbyu, u: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                />
              </div>
            )}
          </div>          

          {/* ===== INGREDIENTS ===== */}
          <section className={styles.listWrap}>
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
          </section>
          {/* ===== STEPS ===== */}
          <section className={styles.listWrap}>
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
          </section>
        </div>
      </div>
      {toast && (
        <div className={styles.toast}>
          {toast}
        </div>
      )}
    </PageFade>
    </>
  );
}