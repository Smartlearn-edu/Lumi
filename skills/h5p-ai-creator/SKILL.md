---
name: h5p-ai-creator
description: Autonomous instructional designer and H5P engineer skill. Generates interactive H5P learning content (quizzes, flashcards, fill-in-the-blanks, course presentations, interactive books) from user prompts, syllabi, or documents, coordinates multi-modal media generation, and compiles valid .h5p, HTML, and SCORM packages using lumi-cli.
---

# H5P AI Creator Skill

This skill equips the agent to act as an expert instructional designer and H5P software engineer. It enables end-to-end creation of interactive learning activities from prompts, textbook chapters, lecture notes, or syllabi, compiling them into production-ready `.h5p`, standalone HTML, and SCORM packages.

---

## Supported Content Types

* **Assessment & Practice (Tier A)**:
  * `H5P.MultiChoice`: Single/multi-answer quizzes with hints, distractors, and pedagogical feedback.
  * `H5P.TrueFalse`: Concept checks with specific explanations.
  * `H5P.Blanks`: Cloze fill-in-the-blank exercises with synonym support and inline tips.
  * `H5P.DragText`: Drag-and-drop word placement.
  * `H5P.Dialogcards` / `H5P.Flashcards`: Spaced repetition memory decks with front/back text and media.
  * `H5P.Summary`: Multi-statement interactive summaries.
* **Composite Modules & Courses (Tier B)**:
  * `H5P.CoursePresentation`: Interactive multi-slide lecture presentations with embedded 2D layouts, text, diagrams, and quizzes.
  * `H5P.InteractiveBook`: Multi-chapter digital textbooks embedding rich text, interactive activities, and progress tracking.
  * `H5P.Column`: Vertically stacked learning modules combining explanations, media, and knowledge checks.

---

## Step-by-Step Generation Workflow

### Step 1: Educational Scope & Requirement Analysis
1. Determine the subject, educational level (e.g., K-12, undergraduate, professional training), target language, and desired activity type.
2. If the user provides a document (PDF, Markdown notes, syllabus), read the document and identify:
   * Key Definitions & Terms $\rightarrow$ Flashcards or Fill-in-the-Blanks.
   * Core Concepts & Explanations $\rightarrow$ CoursePresentation slides or InteractiveBook chapters.
   * Formative Checkpoints $\rightarrow$ Multiple Choice or Summary statements.

### Step 2: Multi-Modal Media Generation
H5P activities are significantly more effective with visual and explanatory media:
1. **Diagrams, Charts & Schemes**: Generate clean, standalone SVG files directly and save them to a local `images/` directory (e.g. `./images/diagram.svg`).
2. **Illustrations**: If conceptual artwork or realistic images are needed, invoke available image generation tools or subagents and save to `./images/`.
3. **User Media**: If the user provides images, audio, or video files, copy them into the activity directory. The `lumi-cli` compiler will automatically inspect their dimensions and MIME types.

### Step 3: Author Pedagogical IR JSON
Draft the activity using the **Compact Pedagogical IR schema**.
* Consult `skills/h5p-ai-creator/references/ir-schemas.md` for exact field structures for each content type.
* Ensure:
  * Questions have formative feedback for both correct and incorrect choices.
  * Slides in `CoursePresentation` specify sensible semantic layouts (`title-slide`, `text-left-image-right`, `full-slide-quiz`, `header-bullets`).
  * Relative media paths point to the files created in Step 2.

### Step 4: Validate and Compile Package
Execute the local compilation script:

```bash
# Compile to standard .h5p package
./skills/h5p-ai-creator/scripts/build-h5p.sh compile activity.json -o output.h5p

# Or compile to standalone offline HTML bundle
./skills/h5p-ai-creator/scripts/build-h5p.sh compile activity.json -o output.html -f html

# Or compile to SCORM 1.2 LMS package
./skills/h5p-ai-creator/scripts/build-h5p.sh compile activity.json -o output-scorm.zip -f scorm
```

The compiler will:
1. Hydrate all missing `semantics.json` defaults (UI labels, accessibility text, behaviour flags).
2. Calculate non-overlapping 2D coordinates for slide layouts.
3. Automatically wrap sub-activities in UUIDv4 `subContentId` blocks.
4. Auto-detect media MIME types and pixel dimensions.
5. Recursively resolve and bundle all required H5P library dependencies.

### Step 5: Verify and Present Deliverable
1. Verify package validity:
   ```bash
   ./skills/h5p-ai-creator/scripts/build-h5p.sh validate output.h5p
   ```
2. Present the resulting file links to the user with a brief pedagogical summary of the generated content.
