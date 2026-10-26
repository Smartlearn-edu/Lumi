# Pedagogical IR Schemas & Examples Reference

The **Compact Pedagogical Intermediate Representation (IR)** is a simplified, human- and LLM-friendly JSON format that captures educational intent without requiring knowledge of H5P's internal coordinates, UUID wrappers, or UI localization boilerplate.

The `lumi-cli compile` command automatically hydrates and compiles these IR objects into standard `.h5p`, `.html`, or SCORM packages.

---

## Tier A: Atomic Assessment Content Types

### 1. `H5P.MultiChoice` (Multiple Choice Quiz)
```json
{
  "title": "Photosynthesis Quiz",
  "language": "en",
  "type": "H5P.MultiChoice",
  "question": "Which gas is released by plants as a byproduct of photosynthesis?",
  "singleAnswer": true,
  "randomAnswers": true,
  "answers": [
    {
      "text": "Oxygen (O2)",
      "correct": true,
      "feedback": "Correct! Oxygen is released from the photolysis of water.",
      "tip": "Think about what humans breathe."
    },
    {
      "text": "Carbon Dioxide (CO2)",
      "correct": false,
      "feedback": "Incorrect. Carbon dioxide is absorbed by plants, not released."
    },
    {
      "text": "Nitrogen (N2)",
      "correct": false
    }
  ],
  "image": "./images/leaf.svg",
  "imageAlt": "Diagram of a leaf cross-section"
}
```

### 2. `H5P.TrueFalse` (True/False Question)
```json
{
  "title": "Mitosis Fact Check",
  "language": "en",
  "type": "H5P.TrueFalse",
  "question": "Mitosis results in two genetically identical daughter cells.",
  "correct": true,
  "feedbackOnCorrect": "Correct! Mitosis produces identical diploid cells.",
  "feedbackOnWrong": "Incorrect. Mitosis maintains genetic identity; meiosis introduces variation."
}
```

### 3. `H5P.Blanks` (Fill in the Blanks)
Supports both structured sentence definitions and shorthand asterisk syntax.
```json
{
  "title": "Cell Respiration Vocabulary",
  "language": "en",
  "type": "H5P.Blanks",
  "taskDescription": "Fill in the missing terms in the cellular respiration summary:",
  "sentences": [
    {
      "text": "Cellular respiration occurs primarily within the {{0}} and synthesizes {{1}}.",
      "blanks": [
        {
          "accepted": ["mitochondria", "mitochondrion"],
          "hint": "Powerhouse of the cell"
        },
        {
          "accepted": ["ATP", "adenosine triphosphate"],
          "hint": "Primary cellular energy currency"
        }
      ]
    },
    "Glycolysis takes place in the *cytoplasm/cytosol:fluid matrix of the cell*."
  ]
}
```

### 4. `H5P.DragText` (Drag the Words)
```json
{
  "title": "Newton's Laws Matching",
  "language": "en",
  "type": "H5P.DragText",
  "taskDescription": "Drag each term into its corresponding definition:",
  "sentences": [
    "An object at rest stays at rest due to *inertia*.",
    "Force equals *mass* multiplied by *acceleration*.",
    "For every action, there is an equal and opposite *reaction*."
  ]
}
```

### 5. `H5P.Dialogcards` (Interactive Flip Flashcards)
```json
{
  "title": "Cell Organelles Study Deck",
  "language": "en",
  "type": "H5P.Dialogcards",
  "description": "Turn the cards to test your knowledge of cellular structures:",
  "cards": [
    {
      "front": "What is the primary function of Ribosomes?",
      "back": "Protein synthesis (translating mRNA into polypeptide chains).",
      "tip": "Think about protein"
    },
    {
      "front": "What is the function of the Golgi Apparatus?",
      "back": "Modifying, sorting, and packaging proteins for secretion.",
      "image": "./images/golgi.svg",
      "imageAlt": "Diagram of Golgi apparatus"
    }
  ]
}
```

### 6. `H5P.Summary` (Interactive Summary Statements)
```json
{
  "title": "Ecosystem Dynamics Summary",
  "language": "en",
  "type": "H5P.Summary",
  "intro": "Choose the correct statements to build a summary of ecosystem energy flow:",
  "summaries": [
    {
      "statements": [
        "Energy decreases by roughly 90% at each higher trophic level.",
        "Energy increases at each higher trophic level.",
        "Energy remains 100% constant across all trophic levels."
      ],
      "tip": "Review the 10% rule in ecology."
    },
    {
      "statements": [
        "Producers capture sunlight and convert it into chemical energy.",
        "Decomposers are the primary source of sunlight in ecosystems."
      ]
    }
  ]
}
```

---

## Tier B: Composite & Multi-Part Modules

### 7. `H5P.CoursePresentation` (Interactive Multi-Slide Deck)
Layout types available:
- `title-slide`: Centered title and subtitle.
- `header-bullets`: Header on top, formatted HTML bullets below.
- `text-left-image-right`: 48% text column on left, 48% diagram on right.
- `image-left-text-right`: 48% diagram on left, 48% text on right.
- `full-image`: Centered 85% wide diagram with caption.
- `full-slide-quiz`: Full-width embedded interactive quiz.
- `split-quiz-diagram`: Left 45% diagram, right 50% interactive quiz.

```json
{
  "title": "Cellular Biology Presentation",
  "language": "en",
  "type": "H5P.CoursePresentation",
  "slides": [
    {
      "layout": "title-slide",
      "title": "Cell Structure & Metabolism",
      "subtitle": "An interactive introductory guide for biology students"
    },
    {
      "layout": "text-left-image-right",
      "title": "Eukaryotic Cell Anatomy",
      "html": "<ul><li><strong>Membrane</strong>: Phospholipid bilayer regulating transport.</li><li><strong>Nucleus</strong>: Contains genetic DNA.</li><li><strong>Cytoplasm</strong>: Aqueous interior.</li></ul>",
      "image": {
        "src": "./images/cell.svg",
        "alt": "Eukaryotic Cell Diagram"
      }
    },
    {
      "layout": "full-slide-quiz",
      "title": "Checkpoint: Cellular Function",
      "activity": {
        "type": "H5P.MultiChoice",
        "question": "Which organelle generates the majority of cellular ATP?",
        "answers": [
          { "text": "Mitochondria", "correct": true, "feedback": "Correct!" },
          { "text": "Lysosome", "correct": false }
        ]
      }
    }
  ]
}
```

### 8. `H5P.InteractiveBook` (Multi-Chapter Digital Book)
```json
{
  "title": "Modern Genetics Interactive Textbook",
  "language": "en",
  "type": "H5P.InteractiveBook",
  "chapters": [
    {
      "title": "Chapter 1: DNA Structure",
      "content": [
        {
          "type": "text",
          "html": "<h2>DNA Double Helix</h2><p>DNA consists of two strands forming a double helix...</p>"
        },
        {
          "type": "H5P.TrueFalse",
          "question": "Adenine pairs with Cytosine in standard DNA.",
          "correct": false,
          "feedbackOnWrong": "Adenine pairs with Thymine (A-T)."
        }
      ]
    },
    {
      "title": "Chapter 2: RNA and Transcription",
      "content": [
        {
          "type": "text",
          "html": "<h2>Transcription Process</h2><p>RNA polymerase transcribes DNA into mRNA...</p>"
        }
      ]
    }
  ]
}
```
