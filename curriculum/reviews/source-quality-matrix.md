# Source quality matrix

Strict source-quality requirement: **partially satisfied; expert review pending.**

Internal selection review: **needs_work**. Assessed 2026-11-01 by Claude (author assessment, not independent); ChatGPT (internal re-assessment, not independent).

Evidence: `curriculum/reviews/source-selection-review.md`.

Independent subject-matter review: **not_performed**.

> No independent subject-matter expert has reviewed these selections. Independent review is not a prerequisite for the evidence-based internal acceptance process; none is claimed or scheduled. The strict highest-quality publicly available learning-resource goal remains active, with finite candidate coverage and disclosed uncertainty rather than a claim of objectively proven global superiority.

Generated from `curriculum/sources/comparison-matrix.json` by `scripts/render_source_matrix.py`; edit the JSON, not this page.

## Method

Each topic block compares public candidates on seven criteria using 1-5 ordinal scores and source-specific evidence. Scores are not summed or weighted: the highest teaching score alone does not settle a multidimensional choice, and primary-definition references are distinguished from teaching resources. The original scoring followed existing selections; the subsequent internal re-assessment explicitly revisits stronger and close alternatives and changes the learning route where warranted. Licensing governs permitted use only, never pedagogical merit. Assessment is AI-assisted and not independent; structural tests verify records, not teaching effectiveness or an exhaustive global optimum.

Scale: 1 = absent or poor fit; 2 = weak; 3 = adequate; 4 = strong; 5 = very strong for this block.

| Column | Criterion | Question |
|---|---|---|
| Ped | pedagogical_quality | Is the material written to teach (sequence, motivation, worked examples) rather than only to specify? |
| Cov | coverage | How much of the block's concepts does it cover? |
| Clr | clarity | How readable is it for a learner at this point of the course? |
| Ex | exercises | Does it provide practice with answers or checks? |
| Cur | currency | How recent and maintained is it, and does its age affect correctness? |
| Acc | accessibility | Free to read? Offline copy? Platform or hardware requirements? |
| Rel | relevance | How closely does it match the block's specific activities and projects? |

## Licensing

Licensing is recorded per candidate (license, licensing_note) and is not scored. A license never raises a quality score; it only limits how a source may be used. All cited sources are linked or explained in the course's own words (reuse_category linking or original_explanation); nothing is reproduced.

## Internal review limitations

- The claim-fidelity review is a twelve-claim sample, not an audit of every required lesson claim.
- Efron 1979 primary-text locator remains pending; its body could not be inspected.
- The fine-tuning teaching candidate has an overbroad LoRA GPU-memory claim, excluded from the assigned sections; a fuller vetted LoRA teaching comparison remains desirable.
- The legacy evaluation guidebook is useful for stable methodology, but an accessible maintained teaching successor has not been established.

## Python object semantics, files and first Git workflow (Days 1-7)

| Candidate | Ped | Cov | Clr | Ex | Cur | Acc | Rel | License |
|---|---|---|---|---|---|---|---|---|
| [Python documentation: Built-in Types and Data model](https://docs.python.org/3/library/stdtypes.html) (selected) | 3 | 5 | 4 | 1 | 5 | 5 | 5 | PSF License Version 2 |
| [The Python Tutorial](https://docs.python.org/3/tutorial/) (selected) | 4 | 3 | 4 | 1 | 5 | 5 | 4 | PSF License Version 2 |
| [MIT OCW 6.0001 Introduction to Computer Science and Programming in Python (Fall 2016)](https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/) | 4 | 3 | 4 | 4 | 2 | 4 | 2 | CC BY-NC-SA 4.0 |
| [Pro Git, 2nd edition (Chacon and Straub)](https://git-scm.com/book/en/v2) (selected) | 4 | 5 | 4 | 1 | 3 | 5 | 5 | CC BY-NC-SA 3.0 |
| [Atlassian Git tutorials](https://www.atlassian.com/git/tutorials) | 3 | 3 | 4 | 1 | 3 | 4 | 3 | All Rights Reserved |
| [Automate the Boring Stuff with Python, 3rd edition (selected introductory chapters)](https://automatetheboringstuff.com/3e/) (selected) | 4 | 4 | 5 | 4 | 4 | 5 | 5 | Copyright Al Sweigart; edition-specific reuse terms unverified |

**Selected:** `automate-boring-stuff-3e`, `py-tutorial-control-flow`, `py-docs-builtins-ticket26`, `py-docs-datamodel`, `git-scm-book-diffs`
<br>**Teaching:** `automate-boring-stuff-3e`, `py-tutorial-control-flow`, `git-scm-book-diffs`
<br>**Definition/API reference:** `py-docs-builtins-ticket26`, `py-docs-datamodel`
<br>**Also cited:** `dunlosky-2013-effective-techniques`

**Rationale:** Use beginner book practice before exact Python semantic checks, with Pro Git for staging and diffs. The official tutorial assumes some programming familiarity; it is no longer treated as the only teaching route. MIT 6.0001 remains a substantive lecture alternative, not rejected for copyright; shorter selected text chapters match the existing reading window without importing the whole semester.

<details><summary>Evidence notes</summary>

- **Python documentation: Built-in Types and Data model**: licensing: Linking only; the documentation license would allow excerpts but none are used.
  - pedagogical_quality 3: Reference prose, not a teaching sequence; examples are short and assume the reader knows what to look for.
  - coverage 5: Specifies truthiness, comparisons, mutability, identity and every built-in type the days use.
  - clarity 4: Precise wording; dense for a first-week learner.
  - exercises 1: No exercises; the course supplies its own drills.
  - currency 5: Versioned per Python release and maintained with CPython.
  - accessibility 5: Free online and downloadable for offline use.
  - relevance 5: Days 1-7 check claims about mutation and aliasing against exactly these sections.
- **The Python Tutorial**: licensing: Linking only.
  - pedagogical_quality 4: Written as a guided introduction with interpreter sessions.
  - coverage 3: Covers syntax and data structures; the object model is only sketched.
  - clarity 4: Plain language with runnable snippets.
  - exercises 1: No exercise sets.
  - currency 5: Maintained with each Python release.
  - accessibility 5: Free online and downloadable.
  - relevance 4: Used for control flow; too shallow alone for the aliasing drills.
- **MIT OCW 6.0001 Introduction to Computer Science and Programming in Python (Fall 2016)**: licensing: Noncommercial and share-alike terms; linking only.
  - pedagogical_quality 4: Full university course with lectures, slides and problem sets.
  - coverage 3: Broad CS1 scope; the data model is covered less precisely than the reference.
  - clarity 4: Lecture-paced explanations.
  - exercises 4: Problem sets with starter code.
  - currency 2: Fall 2016 offering targets Python 3.5.
  - accessibility 4: Free; videos need streaming or a manual download.
  - relevance 2: Semester pacing does not match a seven-day block; kept as a compared candidate (D4.13).
- **Pro Git, 2nd edition (Chacon and Straub)**: licensing: Noncommercial share-alike book license; chapters are linked, not copied.
  - pedagogical_quality 4: Builds the snapshot/staging mental model before commands.
  - coverage 5: Recording changes, diffs, branching and recovery all covered.
  - clarity 4: Clear prose with diagrams.
  - exercises 1: No exercises; the course adds a disposable practice repo.
  - currency 3: Second edition dates from 2014; the online copy receives corrections.
  - accessibility 5: Free online, PDF and EPUB.
  - relevance 5: Day 6-7 Git drills follow its Git Basics chapter.
- **Atlassian Git tutorials**: licensing: Proprietary site; would be linking only.
  - pedagogical_quality 3: Task-oriented pages with diagrams.
  - coverage 3: Common commands; less on the object model.
  - clarity 4: Short, readable pages.
  - exercises 1: No exercises.
  - currency 3: Undated pages; maintained by a vendor.
  - accessibility 4: Free online; no offline package.
  - relevance 3: Usable but vendor-oriented; Pro Git covers the same ground under an open license.
- **Automate the Boring Stuff with Python, 3rd edition (selected introductory chapters)**: licensing: Publicly readable HTML and answer appendix; exact edition reuse terms unverified, so linking only.
  - pedagogical_quality 4: Chapters introduce interactive predictions before short programs; suitable for a complete programming beginner.
  - coverage 4: Selected chapters cover values, names, containers and files; no Git and not the complete data-model specification.
  - clarity 5: Concrete prose and small examples; no prerequisite programming experience assumed.
  - exercises 4: Chapter-end questions and Appendix B answers; projects do not have unique official solutions.
  - currency 4: Third-edition text is public; modern Python basics, not a release-specific language reference.
  - accessibility 5: Free static HTML, including the answer appendix; no account or specialist hardware needed for these chapters.
  - relevance 5: Chapter 1 supports Day 4 values/types before exact language semantics are checked in the reference.

</details>

## Text tools project, control flow and unit testing (Days 8-15)

| Candidate | Ped | Cov | Clr | Ex | Cur | Acc | Rel | License |
|---|---|---|---|---|---|---|---|---|
| [The Python Tutorial (control flow, input and output, venv)](https://docs.python.org/3/tutorial/controlflow.html) (selected) | 4 | 4 | 4 | 1 | 5 | 5 | 5 | PSF License Version 2 |
| [Python documentation: unittest](https://docs.python.org/3/library/unittest.html) (selected) | 3 | 5 | 3 | 1 | 5 | 5 | 5 | PSF License Version 2 |
| [pytest documentation](https://docs.pytest.org/en/stable/) | 4 | 4 | 4 | 1 | 5 | 4 | 3 | MIT |
| [Automate the Boring Stuff with Python (Al Sweigart)](https://automatetheboringstuff.com/3e/) (selected) | 4 | 4 | 5 | 4 | 4 | 5 | 4 | Copyright Al Sweigart; edition-specific reuse terms unverified |
| [Pro Git, 2nd edition](https://git-scm.com/book/en/v2) (selected) | 4 | 4 | 4 | 1 | 3 | 5 | 4 | CC BY-NC-SA 3.0 |

**Selected:** `automate-boring-stuff-3e`, `py-tutorial-control-flow`, `py-docs-unittest`, `git-book`
<br>**Teaching:** `automate-boring-stuff-3e`, `py-tutorial-control-flow`, `git-book`
<br>**Definition/API reference:** `py-docs-unittest`
<br>**Also cited:** `text-tools-project`

**Rationale:** Promote the higher-clarity, answer-keyed book chapters for loops, functions, containers and files. Retain unittest docs for its actual API rather than using lack of unittest coverage to reject the book wholesale; pytest would change the taught test framework, not improve all concepts. Git practice remains anchored in Pro Git.

<details><summary>Evidence notes</summary>

- **The Python Tutorial (control flow, input and output, venv)**: licensing: Linking only.
  - pedagogical_quality 4: Guided introduction with interpreter sessions.
  - coverage 4: Control flow, functions, file I/O and virtual environments are all present.
  - clarity 4: Plain language with runnable snippets.
  - exercises 1: No exercises.
  - currency 5: Maintained with each Python release.
  - accessibility 5: Free online and downloadable.
  - relevance 5: Matches the text_tools project's functions, file reading and venv setup.
- **Python documentation: unittest**: licensing: Linking only.
  - pedagogical_quality 3: Reference with a short basic example.
  - coverage 5: TestCase, assertions, discovery and the command-line runner.
  - clarity 3: Complete but long.
  - exercises 1: No exercises.
  - currency 5: Maintained with CPython.
  - accessibility 5: Standard library; nothing to install.
  - relevance 5: The project's tests use unittest so no environment change is needed.
- **pytest documentation**: licensing: Linking only.
  - pedagogical_quality 4: Getting-started guide and how-to pages.
  - coverage 4: Fixtures and parametrization go beyond what the block needs.
  - clarity 4: Concise examples.
  - exercises 1: No exercises.
  - currency 5: Actively maintained.
  - accessibility 4: Free; requires installing a third-party package.
  - relevance 3: Adds an installation step the block avoids on purpose.
- **Automate the Boring Stuff with Python (Al Sweigart)**: licensing: Publicly readable HTML and answer appendix; exact edition reuse terms unverified, so linking only.
  - pedagogical_quality 4: Beginner-oriented, project-driven chapters.
  - coverage 4: Files, strings and regular expressions overlap the text tools project.
  - clarity 5: Very gentle prose.
  - exercises 4: Practice questions and projects at chapter ends.
  - currency 4: Revised editions continue; the site links the third edition.
  - accessibility 5: Free to read online.
  - relevance 4: Selected Chapters 3, 4, 6, 7 and 10 directly support Days 8-10 loops, functions, containers and files; unittest remains separately taught.
- **Pro Git, 2nd edition**: licensing: Noncommercial share-alike; linking only.
  - pedagogical_quality 4: Builds the branch model with diagrams.
  - coverage 4: Branching, merging and conflicts.
  - clarity 4: Clear prose.
  - exercises 1: No exercises.
  - currency 3: Second edition from 2014.
  - accessibility 5: Free online, PDF and EPUB.
  - relevance 4: Used for the branch and merge practice in the project.

</details>

## Derivatives, the chain rule and gradients (Days 16-21)

| Candidate | Ped | Cov | Clr | Ex | Cur | Acc | Rel | License |
|---|---|---|---|---|---|---|---|---|
| [OpenStax Calculus Volumes 1 and 3](https://openstax.org/details/books/calculus-volume-1) (selected) | 4 | 5 | 4 | 5 | 3 | 5 | 5 | CC BY-NC-SA 4.0 |
| [MIT OCW 18.01SC and 18.02SC (Single and Multivariable Calculus)](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/) (selected) | 5 | 5 | 4 | 5 | 2 | 4 | 4 | CC BY-NC-SA 4.0 |
| [3Blue1Brown: Essence of Calculus](https://www.3blue1brown.com/topics/calculus) (selected) | 5 | 2 | 5 | 1 | 3 | 4 | 4 | 3Blue1Brown copyright (all rights reserved) |
| [Paul's Online Math Notes: Calculus I and III](https://tutorial.math.lamar.edu/Classes/CalcI/CalcI.aspx) | 4 | 5 | 4 | 5 | 3 | 4 | 4 | All Rights Reserved |
| [Khan Academy: Multivariable Calculus](https://www.khanacademy.org/math/multivariable-calculus) | 4 | 4 | 4 | 3 | 3 | 4 | 3 | CC BY-NC-SA 4.0 |

**Selected:** `mit-ocw-18-01sc`, `openstax-calculus-1`, `openstax-calculus-3`, `3blue1brown-essence-of-calculus`, `mit-ocw-18-02sc`
<br>**Teaching:** `mit-ocw-18-01sc`, `mit-ocw-18-02sc`, `openstax-calculus-1`, `openstax-calculus-3`, `3blue1brown-essence-of-calculus`
<br>**Also cited:** `scipy-derivative`

**Rationale:** Promote selected OCW independent-study sessions and worked practice alongside OpenStax numbered text; older recording dates do not make stable calculus inferior. 3Blue1Brown supplies intuition, not checked exercises. Paul's Notes is a close worked-solution alternative, not excluded for rights; the selected text-plus-recitation set avoids duplicate assigned reading.

<details><summary>Evidence notes</summary>

- **OpenStax Calculus Volumes 1 and 3**: licensing: Attribution, noncommercial and share-alike; sections are linked, not copied.
  - pedagogical_quality 4: Textbook sequence with definitions, theorems and worked examples.
  - coverage 5: Section 3.6 (chain rule), 4.3 (partial derivatives), 4.5 and 4.6 cover every day's topic.
  - clarity 4: Careful notation; standard textbook density.
  - exercises 5: End-of-section exercises with answers to odd-numbered problems.
  - currency 3: First published 2016; the web edition receives errata.
  - accessibility 5: Free web, PDF and print-on-demand.
  - relevance 5: Section numbers map one-to-one to the day plans.
- **MIT OCW 18.01SC and 18.02SC (Single and Multivariable Calculus)**: licensing: Noncommercial share-alike; linking only.
  - pedagogical_quality 5: Scholar-format sessions: lecture, recitation video, problems and solutions.
  - coverage 5: Full single- and multivariable calculus.
  - clarity 4: Clear lectures; navigation spans many pages.
  - exercises 5: Problem sets with full solutions.
  - currency 2: Fall 2010 materials.
  - accessibility 4: Free; videos need streaming or a manual download.
  - relevance 4: Selected Unit 1 sessions support Days 16, 17 and 19; Part 2 partial derivatives supports Day 20. The unassigned semester remainder is not a workload requirement.
- **3Blue1Brown: Essence of Calculus**: licensing: All rights reserved; videos are linked, never embedded or transcribed.
  - pedagogical_quality 5: Visual explanations built around intuition.
  - coverage 2: Single-variable only; no gradients.
  - clarity 5: Animated geometric explanations.
  - exercises 1: No exercise sets.
  - currency 3: Released 2017; the mathematics is stable.
  - accessibility 4: Free to watch; needs streaming.
  - relevance 4: Chapter 4 supports the Day 19 chain-rule intuition.
- **Paul's Online Math Notes: Calculus I and III**: licensing: Proprietary; would be linking only.
  - pedagogical_quality 4: Notes written for students with many worked examples.
  - coverage 5: Calculus I through III.
  - clarity 4: Step-by-step worked examples.
  - exercises 5: Practice and assignment problems, practice solutions provided.
  - currency 3: Maintained by one author; pages are undated.
  - accessibility 4: Free online; PDF downloads offered.
  - relevance 4: Worked solutions fit the derivative drills. Not selected as an additional spine because OpenStax plus selected OCW sessions already supply text and checked practice, not because of copyright.
- **Khan Academy: Multivariable Calculus**: licensing: Noncommercial share-alike; linking only.
  - pedagogical_quality 4: Short videos and articles.
  - coverage 4: Partial derivatives, gradient and multivariable chain rule.
  - clarity 4: Short focused units.
  - exercises 3: Some practice items; fewer than the single-variable courses.
  - currency 3: Videos largely from 2016.
  - accessibility 4: Free; needs network and JavaScript.
  - relevance 3: Useful for gradients but no single section structure to cite.

</details>

## Vectors, matrices and array memory (Days 22-24)

| Candidate | Ped | Cov | Clr | Ex | Cur | Acc | Rel | License |
|---|---|---|---|---|---|---|---|---|
| [3Blue1Brown: Essence of Linear Algebra](https://www.3blue1brown.com/topics/linear-algebra) (selected) | 5 | 4 | 5 | 1 | 3 | 4 | 5 | 3Blue1Brown copyright (all rights reserved) |
| [MIT OCW 18.06 Linear Algebra (Gilbert Strang, Spring 2010)](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/) (selected) | 5 | 5 | 4 | 5 | 2 | 4 | 4 | CC BY-NC-SA 4.0 |
| [NumPy documentation: ndarray and broadcasting](https://numpy.org/doc/stable/reference/arrays.ndarray.html) (selected) | 3 | 4 | 3 | 1 | 5 | 5 | 5 | BSD 3-Clause License |
| [Linear Algebra Done Right, 4th edition (Sheldon Axler)](https://linear.axler.net/) | 4 | 4 | 4 | 5 | 5 | 5 | 2 | CC BY-NC (4th edition, Open Access) |
| [Immersive Linear Algebra](https://immersivemath.com/ila/index.html) | 4 | 4 | 4 | 2 | 3 | 3 | 3 | Free online (site terms; no open license stated) |

**Selected:** `3blue1brown-linear-algebra`, `mit-ocw-1806-strang`, `numpy-docs-ndarray`
<br>**Teaching:** `3blue1brown-linear-algebra`, `mit-ocw-1806-strang`
<br>**Definition/API reference:** `numpy-docs-ndarray`
<br>**Also cited:** `numpy-docs-broadcasting`

**Rationale:** Retain the visual-plus-computational Strang route and NumPy memory reference. Axler remains a close mathematical text with strong exercises and openly readable fourth edition; its proof-first abstract-space progression does not replace the particular matrix/shape/stride tasks in this three-day block. Recording age is not evidence of mathematical error.

<details><summary>Evidence notes</summary>

- **3Blue1Brown: Essence of Linear Algebra**: licensing: All rights reserved; linked, never embedded or transcribed.
  - pedagogical_quality 5: Geometric intuition for linear maps and matrix products.
  - coverage 4: Vectors to eigenvectors; no numerical computing.
  - clarity 5: Animated explanations.
  - exercises 1: No exercise sets.
  - currency 3: Released 2016; stable mathematics.
  - accessibility 4: Free to watch; needs streaming.
  - relevance 5: Matrix-as-transformation view used throughout the three days.
- **MIT OCW 18.06 Linear Algebra (Gilbert Strang, Spring 2010)**: licensing: Noncommercial share-alike; linking only.
  - pedagogical_quality 5: Full lecture course with a consistent row/column-picture approach.
  - coverage 5: Linear systems, products, inverses, spaces.
  - clarity 4: Lecture style; long sessions.
  - exercises 5: Problem sets and exams with solutions.
  - currency 2: Spring 2010 recordings.
  - accessibility 4: Free; videos need streaming or a manual download.
  - relevance 4: Lectures 1-3 match the block; the rest exceeds it.
- **NumPy documentation: ndarray and broadcasting**: licensing: Linking only.
  - pedagogical_quality 3: Reference pages with a few examples.
  - coverage 4: Shapes, strides, views and broadcasting rules.
  - clarity 3: Precise but technical.
  - exercises 1: No exercises.
  - currency 5: Versioned with NumPy releases.
  - accessibility 5: Free online and downloadable.
  - relevance 5: Days 23-24 memory accounting uses strides and views.
- **Linear Algebra Done Right, 4th edition (Sheldon Axler)**: licensing: The 4th edition is Open Access under a Creative Commons BY-NC license (checked on linear.axler.net, 2026-11-01).
  - pedagogical_quality 4: Proof-based, determinant-free approach.
  - coverage 4: Abstract vector spaces in depth.
  - clarity 4: Careful prose; abstract.
  - exercises 5: Many exercises per section.
  - currency 5: 4th edition published 2023-2024.
  - accessibility 5: Free PDF.
  - relevance 2: Proof-oriented; the block needs computation with matrices and arrays.
- **Immersive Linear Algebra**: licensing: Site terms only; linking only.
  - pedagogical_quality 4: Interactive figures for each concept.
  - coverage 4: Vectors to eigenvalues.
  - clarity 4: Readable chapters.
  - exercises 2: Few exercises.
  - currency 3: Undated pages; update cadence unknown.
  - accessibility 3: Free; needs a browser with interactive graphics.
  - relevance 3: Visual support only; overlaps 3Blue1Brown.

</details>

## Probability, statistics and information theory (Days 25-30)

| Candidate | Ped | Cov | Clr | Ex | Cur | Acc | Rel | License |
|---|---|---|---|---|---|---|---|---|
| [OpenStax Introductory Statistics 2e](https://openstax.org/details/books/introductory-statistics-2e) (selected) | 4 | 4 | 4 | 5 | 4 | 5 | 4 | CC BY-NC-SA 4.0 |
| [Dive into Deep Learning (d2l.ai)](https://d2l.ai/) (selected) | 4 | 4 | 4 | 4 | 4 | 5 | 5 | CC BY-SA 4.0 (book text) / modified MIT (code) |
| [Information Theory, Inference, and Learning Algorithms (David MacKay)](https://www.inference.org.uk/itila/book.html) (selected) | 4 | 5 | 3 | 5 | 3 | 4 | 4 | Cambridge University Press copyright; free online reading |
| [OpenIntro Statistics](https://www.openintro.org/book/os/) | 4 | 4 | 4 | 5 | 4 | 5 | 4 | CC BY-SA 3.0 |
| [Harvard Stat 110: Introduction to Probability (Joe Blitzstein)](https://stat110.hsites.harvard.edu/strategic-practice-problems) (selected) | 5 | 4 | 4 | 5 | 3 | 4 | 4 | Harvard University copyright; no open reuse license verified |

**Selected:** `harvard-stat110-practice`, `openstax-introductory-statistics-2e`, `d2l-ai`, `mackay-itila`
<br>**Teaching:** `harvard-stat110-practice`, `openstax-introductory-statistics-2e`, `d2l-ai`, `mackay-itila`
<br>**Also cited:** `cs229-probability-review`, `openintro-statistics`, `nist-sematech-ehandbook`

**Rationale:** Add early Stat 110 counting/conditioning practice with solutions instead of rejecting the higher teaching score because of textbook rights. OpenStax/OpenIntro cover statistics; d2l and MacKay retain information-theory and model-loss roles that the probability course does not supply. Current Harvard access limitations are disclosed, not scored as copyright restrictions.

<details><summary>Evidence notes</summary>

- **OpenStax Introductory Statistics 2e**: licensing: Noncommercial share-alike; sections linked, not copied.
  - pedagogical_quality 4: Textbook with worked examples and practice.
  - coverage 4: Probability, distributions, sampling and confidence intervals; no information theory.
  - clarity 4: Accessible to non-majors.
  - exercises 5: Practice, homework and bringing-it-together exercises with answers.
  - currency 4: Second edition 2023.
  - accessibility 5: Free web and PDF.
  - relevance 4: Matches the probability and estimation days.
- **Dive into Deep Learning (d2l.ai)**: licensing: Share-alike text license; linked, not copied.
  - pedagogical_quality 4: Explanations paired with runnable code.
  - coverage 4: Probability, statistics and information theory appendix aimed at ML.
  - clarity 4: Readable; assumes some programming.
  - exercises 4: Exercises at the end of each section.
  - currency 4: Maintained online with framework updates.
  - accessibility 5: Free web, PDF and notebooks.
  - relevance 5: Connects probability directly to the loss functions used later.
- **Information Theory, Inference, and Learning Algorithms (David MacKay)**: licensing: Publisher copyright with a free PDF for on-screen reading; linking only.
  - pedagogical_quality 4: Exercise-driven with commentary.
  - coverage 5: Entropy, cross-entropy, KL divergence and coding.
  - clarity 3: Demanding mathematical prose.
  - exercises 5: Hundreds of exercises, many with solutions.
  - currency 3: Published 2003; the subject is stable.
  - accessibility 4: Free PDF for reading; printing restricted.
  - relevance 4: Cited for Day 27 surprisal, entropy and cross-entropy.
- **OpenIntro Statistics**: licensing: Share-alike; linking only.
  - pedagogical_quality 4: Introductory textbook with case studies.
  - coverage 4: Probability, inference and regression.
  - clarity 4: Accessible prose.
  - exercises 5: Exercises with odd-numbered solutions.
  - currency 4: Fourth edition 2019.
  - accessibility 5: Free PDF (pay-what-you-want).
  - relevance 4: Overlaps OpenStax for the estimation days.
- **Harvard Stat 110: Introduction to Probability (Joe Blitzstein)**: licensing: Public course practice and solutions are linked only; publisher-held textbook rights do not reduce teaching scores or prohibit linking.
  - pedagogical_quality 5: Story-driven probability course with strong intuition.
  - coverage 4: Full probability course; no information theory.
  - clarity 4: Engaging lectures.
  - exercises 5: Problem sets and strategic practice with solutions.
  - currency 3: Lecture videos are from a past offering; the subject is stable.
  - accessibility 4: Current official practice hub and early PDFs inspected via web retrieval; some direct clients receive HTTP 403. No free textbook availability or reproduction permission is inferred.
  - relevance 4: Early counting and conditional-probability sets now map directly to Day 25; information theory, inference and optimization still require other sources in Days 26-30.

</details>

## Backpropagation and a scalar autograd engine (Days 31-36)

| Candidate | Ped | Cov | Clr | Ex | Cur | Acc | Rel | License |
|---|---|---|---|---|---|---|---|---|
| [micrograd and 'The spelled-out intro to neural networks and backpropagation' (Andrej Karpathy)](https://github.com/karpathy/micrograd) (selected) | 5 | 4 | 5 | 3 | 3 | 5 | 5 | MIT (code) / Standard YouTube License (video) |
| [Neural Networks and Deep Learning, Chapter 2 (Michael Nielsen)](http://neuralnetworksanddeeplearning.com/chap2.html) (selected) | 5 | 4 | 5 | 4 | 2 | 4 | 4 | CC BY-NC 3.0 |
| [PyTorch: Autograd mechanics](https://pytorch.org/docs/stable/notes/autograd.html) (selected) | 3 | 3 | 3 | 1 | 5 | 5 | 4 | Modified BSD |
| [CS231n notes: Backpropagation, Intuitions](https://cs231n.github.io/optimization-2/) | 4 | 4 | 4 | 3 | 3 | 5 | 5 | MIT |
| [3Blue1Brown: Backpropagation](https://www.3blue1brown.com/lessons/backpropagation) | 5 | 2 | 5 | 1 | 3 | 4 | 3 | 3Blue1Brown copyright (all rights reserved) |

**Selected:** `karpathy-micrograd`, `nielsen-neural-networks`, `pytorch-autograd-mechanics`
<br>**Teaching:** `karpathy-micrograd`, `nielsen-neural-networks`
<br>**Definition/API reference:** `pytorch-autograd-mechanics`
<br>**Also cited:** `cs231n-backprop`, `3blue1brown-backprop`, `cs336-basics`

**Rationale:** Retain micrograd's complete small-engine construction and Nielsen's mathematical explanation. CS231n provides concise gate intuition, while 3Blue1Brown offers visual motivation without a full engine. PyTorch notes specify framework behavior rather than replacing beginner teaching; old Nielsen Python 2 examples are not assigned as runnable code.

<details><summary>Evidence notes</summary>

- **micrograd and 'The spelled-out intro to neural networks and backpropagation' (Andrej Karpathy)**: licensing: Code is MIT; video subtitles have unknown rights and are not imported.
  - pedagogical_quality 5: Builds a working engine step by step from scratch.
  - coverage 4: Scalar autograd, topological sort, a small MLP; no tensors.
  - clarity 5: About 100 lines of engine code.
  - exercises 3: Exercises are informal; the course adds tests.
  - currency 3: 2020 code and 2022 lecture; stable topic.
  - accessibility 5: Free; code runs offline.
  - relevance 5: projects/autograd mirrors engine.py's Value class.
- **Neural Networks and Deep Learning, Chapter 2 (Michael Nielsen)**: licensing: Noncommercial; linked, not copied. The site is served over http only (http only, no https).
  - pedagogical_quality 5: Derives the four backpropagation equations with motivation.
  - coverage 4: Matrix-form backpropagation for feed-forward nets.
  - clarity 5: Patient explanations.
  - exercises 4: In-text exercises and problems.
  - currency 2: Written 2015; code is Python 2.
  - accessibility 4: Free online; http only.
  - relevance 4: Used for the matrix-form derivation.
- **PyTorch: Autograd mechanics**: licensing: Linking only.
  - pedagogical_quality 3: Explains internals for users who already know backprop.
  - coverage 3: Graph recording, saved tensors, no_grad.
  - clarity 3: Technical notes.
  - exercises 1: No exercises.
  - currency 5: Versioned with PyTorch.
  - accessibility 5: Free online.
  - relevance 4: Bridges the scalar engine to PyTorch on Days 33-36.
- **CS231n notes: Backpropagation, Intuitions**: licensing: Linking only.
  - pedagogical_quality 4: Circuit-diagram intuition for local gradients.
  - coverage 4: Gates, patterns in backward flow, vectorized gradients.
  - clarity 4: Short and concrete.
  - exercises 3: Course assignments exist separately on the site.
  - currency 3: Notes date from 2015-2017.
  - accessibility 5: Free online.
  - relevance 5: Gate patterns match the Day 32-34 drills.
- **3Blue1Brown: Backpropagation**: licensing: All rights reserved; linked only.
  - pedagogical_quality 5: Visual intuition for credit assignment.
  - coverage 2: Intuition only; no algorithm.
  - clarity 5: Animated explanation.
  - exercises 1: No exercises.
  - currency 3: Released 2017.
  - accessibility 4: Free; needs streaming.
  - relevance 3: Optional intuition before the engine work.

</details>

## Tokenization, n-gram and neural language models, the Transformer (Days 37-48)

| Candidate | Ped | Cov | Clr | Ex | Cur | Acc | Rel | License |
|---|---|---|---|---|---|---|---|---|
| [makemore and minbpe with the Neural Networks: Zero to Hero lectures (Andrej Karpathy)](https://github.com/karpathy/makemore) (selected) | 5 | 4 | 5 | 3 | 4 | 5 | 5 | MIT (code) / Standard YouTube License (video) |
| [The Annotated Transformer (Harvard NLP, 2022 edition)](https://nlp.seas.harvard.edu/annotated-transformer/) (selected) | 5 | 5 | 4 | 3 | 4 | 5 | 5 | MIT |
| [Attention Is All You Need (Vaswani et al., 2017) with Bengio et al. 2003](https://arxiv.org/abs/1706.03762) (selected) | 2 | 5 | 3 | 1 | 3 | 5 | 5 | arXiv.org perpetual non-exclusive license / Open Access |
| [Stanford CS224N: NLP with Deep Learning](https://web.stanford.edu/class/cs224n/) (selected) | 5 | 5 | 4 | 5 | 5 | 3 | 3 | Stanford University copyright |
| [The Illustrated Transformer (Jay Alammar)](https://jalammar.github.io/illustrated-transformer/) | 4 | 3 | 5 | 1 | 3 | 5 | 3 | CC BY-NC 4.0 |

**Selected:** `stanford-cs224n`, `karpathy-makemore`, `karpathy-minbpe`, `annotated-transformer`, `vaswani-attention-2017`, `bengio-2003-nplm`
<br>**Teaching:** `karpathy-makemore`, `karpathy-minbpe`, `annotated-transformer`, `stanford-cs224n`
<br>**Definition/API reference:** `vaswani-attention-2017`, `bengio-2003-nplm`
<br>**Also cited:** `karpathy-nanogpt-model`

**Rationale:** Keep code-first Karpathy/Annotated Transformer teaching and add targeted public CS224N Transformer slides rather than dismissing its exercise advantage as merely a broad semester. Original papers define the architectures, not the teaching sequence. The Day 46 convention now explicitly separates original Post-LN, pre-normalization examples and the tested Xiong claims.

<details><summary>Evidence notes</summary>

- **makemore and minbpe with the Neural Networks: Zero to Hero lectures (Andrej Karpathy)**: licensing: Code is MIT; video subtitles have unknown rights and are not imported.
  - pedagogical_quality 5: Builds bigram, MLP and BPE models from scratch on screen.
  - coverage 4: Bigram to MLP language models and byte-level BPE; attention is covered in a later lecture.
  - clarity 5: Small, readable code.
  - exercises 3: Suggested exercises only; the course adds tests.
  - currency 4: 2022-2024.
  - accessibility 5: Free; code runs offline.
  - relevance 5: Days 37-42 follow the same progression on names.txt.
- **The Annotated Transformer (Harvard NLP, 2022 edition)**: licensing: Linking only.
  - pedagogical_quality 5: Pairs each part of the paper with runnable code.
  - coverage 5: Full encoder-decoder with training loop.
  - clarity 4: Clear, but assumes PyTorch fluency.
  - exercises 3: Runnable notebook; no graded exercises.
  - currency 4: Updated in 2022.
  - accessibility 5: Free web page and notebook.
  - relevance 5: Days 46-48 build the same sublayer and positional-encoding classes.
- **Attention Is All You Need (Vaswani et al., 2017) with Bengio et al. 2003**: licensing: arXiv distribution license; cited, never reproduced.
  - pedagogical_quality 2: Research papers, not teaching texts.
  - coverage 5: Primary definitions of the architectures taught.
  - clarity 3: Terse research prose.
  - exercises 1: No exercises.
  - currency 3: 2003 and 2017; the post-LN placement differs from current practice.
  - accessibility 5: Free PDFs.
  - relevance 5: Section numbers anchor each architecture claim.
- **Stanford CS224N: NLP with Deep Learning**: licensing: Proprietary course site; linking only.
  - pedagogical_quality 5: Full university course with lectures and notes.
  - coverage 5: Word vectors through Transformers and pretraining.
  - clarity 4: Well-structured lectures.
  - exercises 5: Graded assignments with starter code.
  - currency 5: Offered yearly.
  - accessibility 3: Slides free; assignments and some videos depend on the offering.
  - relevance 3: The actual course schedule exposes attention/Transformer lecture slides now assigned to Day 43; a whole-quarter course is not required.
- **The Illustrated Transformer (Jay Alammar)**: licensing: Noncommercial; linking only.
  - pedagogical_quality 4: Step-by-step diagrams.
  - coverage 3: Architecture only; no training or code.
  - clarity 5: Very visual.
  - exercises 1: No exercises.
  - currency 3: Written 2018.
  - accessibility 5: Free online.
  - relevance 3: Visual support; no code to check against.

</details>

## Pretraining loop, decoding, checkpoints and compute (Days 49-60)

| Candidate | Ped | Cov | Clr | Ex | Cur | Acc | Rel | License |
|---|---|---|---|---|---|---|---|---|
| [nanoGPT (train.py, model.py, sample.py)](https://github.com/karpathy/nanoGPT) (selected) | 4 | 5 | 5 | 2 | 2 | 5 | 5 | MIT |
| [Stanford CS336: Language Modeling from Scratch (Assignment 1)](https://github.com/stanford-cs336/assignment1-basics/tree/spring2025) (selected) | 5 | 5 | 4 | 5 | 4 | 4 | 5 | MIT |
| [Transformer Math 101 (EleutherAI)](https://blog.eleuther.ai/transformer-math/) (selected) | 4 | 3 | 4 | 1 | 4 | 5 | 5 | CC-BY 4.0 |
| [Hugging Face Accelerate and Trainer documentation](https://github.com/huggingface/accelerate) | 3 | 4 | 3 | 1 | 5 | 5 | 2 | Apache-2.0 |
| [Megatron-LM (NVIDIA)](https://github.com/NVIDIA/Megatron-LM) | 2 | 5 | 2 | 1 | 5 | 3 | 1 | BSD-3-Clause |
| [nanochat (current repository, compared systems reference)](https://github.com/karpathy/nanochat) | 3 | 5 | 3 | 3 | 5 | 3 | 4 | MIT |

**Selected:** `karpathy-nanogpt-train`, `karpathy-nanogpt-model`, `cs336-basics`, `eleutherai-transformer-math`
<br>**Teaching:** `cs336-basics`, `eleutherai-transformer-math`
<br>**Definition/API reference:** `karpathy-nanogpt-train`, `karpathy-nanogpt-model`
<br>**Also cited:** `holtzman-degeneration-2019`, `pytorch-save-load`, `adamw-paper-2019`, `karpathy-nanogpt-sample`

**Rationale:** CS336 spring2025 now leads the optimizer, clipping and serialization exercises with verifiable adapter contracts/tests; nanoGPT is explicitly historical compact code, not current primary training instruction. Current nanochat was compared rather than ignored, but optimized multi-GPU code is less suited to the first raw-loop exercise. No source is claimed to cover billing cutoffs, atomic writes or top-p when it does not.

<details><summary>Evidence notes</summary>

- **nanoGPT (train.py, model.py, sample.py)**: licensing: Linking only.
  - pedagogical_quality 4: About 300-line training loop that can be read end to end.
  - coverage 5: Batching, AdamW groups, cosine schedule, clipping, checkpointing, sampling.
  - clarity 5: Plain code.
  - exercises 2: No exercises.
  - currency 2: README since November 2025 calls the repo 'very old and deprecated' and points to nanochat.
  - accessibility 5: Free; runs on CPU at toy scale.
  - relevance 5: Every locator in Days 49-60 points at a named function in these files.
- **Stanford CS336: Language Modeling from Scratch (Assignment 1)**: licensing: spring2025 tagged repository LICENSE is MIT; this differs from the older 2024 repository. Linking only; no lecture/video permission is inferred.
  - pedagogical_quality 5: Assignment-driven course with a written handout.
  - coverage 5: Tokenizer, Transformer, AdamW, schedules, checkpointing.
  - clarity 4: Precise handout.
  - exercises 5: Unit tests for every component.
  - currency 4: The exact spring2025 archived tag is used, not a claim that a 2024 repository contains the latest offering; compared with current nanochat.
  - accessibility 4: Public handout, adapters and component tests. Reading and small component work need no Stanford account; full assignment runs require suitable compute.
  - relevance 5: Same components as the block, with tests.
- **Transformer Math 101 (EleutherAI)**: licensing: Attribution license; linked.
  - pedagogical_quality 4: Short derivations with rules of thumb.
  - coverage 3: Compute and memory only.
  - clarity 4: Clear formulas.
  - exercises 1: No exercises.
  - currency 4: Published 2023.
  - accessibility 5: Free online.
  - relevance 5: Day 56 compute and memory arithmetic.
- **Hugging Face Accelerate and Trainer documentation**: licensing: Linking only.
  - pedagogical_quality 3: Usage-oriented docs.
  - coverage 4: Distributed training, mixed precision, checkpointing.
  - clarity 3: Abstractions hide the loop being taught.
  - exercises 1: No exercises.
  - currency 5: Actively maintained.
  - accessibility 5: Free to read online.
  - relevance 2: Hides the steps the block asks learners to write.
- **Megatron-LM (NVIDIA)**: licensing: Linking only.
  - pedagogical_quality 2: Production code base, not teaching material.
  - coverage 5: Large-scale parallel training.
  - clarity 2: Large and complex.
  - exercises 1: No exercises.
  - currency 5: Actively maintained.
  - accessibility 3: Free; needs multi-GPU hardware to run.
  - relevance 1: Far beyond single-machine scope.
- **nanochat (current repository, compared systems reference)**: licensing: Repository MIT LICENSE inspected; no source code or data is imported.
  - pedagogical_quality 3: README explains the scope, but optimized training code is not a stepwise beginner implementation lesson.
  - coverage 5: Pretraining, evaluation, telemetry and checkpointing; no directly inspected gradient-clipping example.
  - clarity 3: Compilation, custom optimizers, distributed state and precision add complexity to the first loop walkthrough.
  - exercises 3: Suggested experiments and optimizer tests, but inspected tests require CUDA and are not a staged assignment.
  - currency 5: Current README includes 2026 updates; moving master is not a pinned stable course edition.
  - accessibility 3: Free repository with a shrunk CPU/MPS demo; full speedrun is an 8xH100 path, not equivalent CPU training.
  - relevance 4: Useful scale comparison; not a direct replacement for the clipping, fault-injection and billing lessons.

</details>

## Instruction data, supervised fine-tuning and LoRA (Days 61-69)

| Candidate | Ped | Cov | Clr | Ex | Cur | Acc | Rel | License |
|---|---|---|---|---|---|---|---|---|
| [LoRA: Low-Rank Adaptation of Large Language Models (Hu et al., 2021)](https://arxiv.org/abs/2106.09685) (selected) | 3 | 5 | 4 | 1 | 4 | 5 | 5 | arXiv.org perpetual non-exclusive license / Open Access |
| [Hugging Face PEFT](https://github.com/huggingface/peft) (selected) | 3 | 4 | 4 | 1 | 5 | 5 | 5 | Apache-2.0 |
| [Stanford Alpaca (blog post and repository)](https://crfm.stanford.edu/2023/03/13/alpaca.html) (selected) | 3 | 3 | 4 | 1 | 3 | 5 | 5 | Copyright Stanford CRFM (blog post; no open license stated) |
| [microsoft/LoRA (loralib)](https://github.com/microsoft/LoRA) | 3 | 3 | 4 | 1 | 2 | 5 | 3 | MIT |
| [Parameter-Efficient Transfer Learning for NLP (Houlsby et al., 2019)](https://arxiv.org/abs/1902.00751) | 3 | 3 | 4 | 1 | 3 | 5 | 2 | Open Access (arXiv) |
| [Hugging Face LLM Course: Fine-tuning LLMs](https://huggingface.co/learn/llm-course/chapter11/1) (selected) | 4 | 4 | 4 | 4 | 5 | 4 | 5 | Apache-2.0 |

**Selected:** `huggingface-llm-course-finetuning`, `hu-lora-2021`, `huggingface-peft`, `taori-alpaca-2023`, `stanford-alpaca-2023`
<br>**Teaching:** `huggingface-llm-course-finetuning`
<br>**Definition/API reference:** `hu-lora-2021`, `huggingface-peft`, `taori-alpaca-2023`, `stanford-alpaca-2023`
<br>**Also cited:** `ouyang-instructgpt-2022`, `huggingface-trl-sfttrainer`, `pytorch-cross-entropy`, `huggingface-chat-templates`

**Rationale:** Add the course's templates/SFT/evaluation sequence and exercises, retaining LoRA Section 4.1 and actual PEFT initialization defaults for method fidelity. Chapter 11.4's overbroad GPU-memory explanation is not adopted; the local ledger includes frozen base weights. Original papers and APIs still lack a fully checked beginner LoRA exercise route, an explicit remaining quality limitation.

<details><summary>Evidence notes</summary>

- **LoRA: Low-Rank Adaptation of Large Language Models (Hu et al., 2021)**: licensing: Cited, never reproduced.
  - pedagogical_quality 3: Research paper with clear method section.
  - coverage 5: Method, initialization, merging and rank studies.
  - clarity 4: Readable for a paper.
  - exercises 1: No exercises.
  - currency 4: 2021; still the reference method for adapters.
  - accessibility 5: Free PDF.
  - relevance 5: Sections 4.1, 4.2 and 7 anchor Days 64-66.
- **Hugging Face PEFT**: licensing: Linking only.
  - pedagogical_quality 3: Quickstart and task guides.
  - coverage 4: LoRA and other adapters, saving and merging.
  - clarity 4: Concise API docs.
  - exercises 1: No exercises.
  - currency 5: Actively maintained.
  - accessibility 5: Free to read online.
  - relevance 5: Used to check the from-scratch adapter against a library.
- **Stanford Alpaca (blog post and repository)**: licensing: The post has no open license; the linked repository's code is Apache-2.0 and its data is CC BY-NC 4.0 (noncommercial). Nothing is copied.
  - pedagogical_quality 3: Short recipe write-up.
  - coverage 3: Data format, training recipe, limitations.
  - clarity 4: Brief and clear.
  - exercises 1: No exercises.
  - currency 3: March 2023.
  - accessibility 5: Free to read online.
  - relevance 5: Days 61-62 data schema and prompt template.
- **microsoft/LoRA (loralib)**: licensing: Linking only.
  - pedagogical_quality 3: Reference implementation with a short README.
  - coverage 3: LoRA layers only.
  - clarity 4: Small code base.
  - exercises 1: No exercises.
  - currency 2: Last commit December 2024 (GitHub API, checked 2026-11-01).
  - accessibility 5: Free to read online.
  - relevance 3: Smaller than PEFT but less maintained.
- **Parameter-Efficient Transfer Learning for NLP (Houlsby et al., 2019)**: licensing: Cited only.
  - pedagogical_quality 3: Research paper.
  - coverage 3: Adapter layers, not low-rank updates.
  - clarity 4: Readable prose.
  - exercises 1: No exercises.
  - currency 3: Published 2019.
  - accessibility 5: Free PDF.
  - relevance 2: Background for adapters; not the method taught.
- **Hugging Face LLM Course: Fine-tuning LLMs**: licensing: First-party huggingface/course LICENSE is Apache-2.0; linked chapters only.
  - pedagogical_quality 4: Sequenced templates, SFT and evaluation with quizzes. Chapter 11.4 has an overbroad GPU-memory claim, so its LoRA memory explanation is not adopted.
  - coverage 4: Workflow coverage complements the low-rank paper; does not derive local masking, contamination or bootstrap mathematics.
  - clarity 4: Short headings and runnable examples; compressed claims need comparison with the paper and actual implementation.
  - exercises 4: Template conversion exercise, LoRA experiments and quizzes; only the assigned templates/SFT/evaluation sections are used here.
  - currency 5: Current first-party course pages and repository checked; API examples must be re-verified against the selected environment.
  - accessibility 4: Free reading; account, downloads and sometimes GPU resources are needed for hosted practical runs.
  - relevance 5: Assigned Chapters 11.2, 11.3 and 11.5 match Days 61-62 and 67-69; original paper and PEFT still anchor Days 64-66.

</details>

## Benchmarks, metrics and honest baselines (Days 70-72)

| Candidate | Ped | Cov | Clr | Ex | Cur | Acc | Rel | License |
|---|---|---|---|---|---|---|---|---|
| [Holistic Evaluation of Language Models (HELM, Liang et al., 2022)](https://arxiv.org/abs/2211.09110) (selected) | 3 | 5 | 3 | 1 | 4 | 5 | 4 | Open Access / CC BY 4.0 |
| [Measuring Massive Multitask Language Understanding (MMLU) with GSM8K](https://arxiv.org/abs/2009.03300) (selected) | 3 | 4 | 4 | 1 | 3 | 5 | 5 | Open Access / arXiv non-exclusive license |
| [SQuAD (Rajpurkar et al., 2016)](https://arxiv.org/abs/1606.05250) (selected) | 3 | 3 | 4 | 1 | 3 | 5 | 5 | Open Access / CC BY-SA 4.0 |
| [EleutherAI LM Evaluation Harness](https://github.com/EleutherAI/lm-evaluation-harness) | 2 | 5 | 3 | 1 | 5 | 4 | 3 | MIT |
| [SuperGLUE (Wang et al., 2019)](https://arxiv.org/abs/1905.00537) | 3 | 3 | 4 | 1 | 2 | 5 | 2 | Open Access (arXiv) |
| [Hugging Face LLM Evaluation Guidebook (legacy edition)](https://github.com/huggingface/evaluation-guidebook) (selected) | 5 | 5 | 4 | 2 | 1 | 4 | 5 | CC BY-NC-SA 4.0 |

**Selected:** `huggingface-evaluation-guidebook`, `liang-helm-2022`, `hendrycks-mmlu-2020`, `cobbe-gsm8k-2021`, `rajpurkar-squad-2016`
<br>**Teaching:** `huggingface-evaluation-guidebook`
<br>**Definition/API reference:** `liang-helm-2022`, `hendrycks-mmlu-2020`, `cobbe-gsm8k-2021`, `rajpurkar-squad-2016`
<br>**Also cited:** `hu-lora-2021`, `taori-alpaca-2023`

**Rationale:** Add practical evaluation-design guidance instead of treating a benchmark-paper-only candidate set as adequate pedagogy. The legacy guidebook is selected for stable methodological chapters with its no-longer-maintained warning, not current commands; individual papers still define exact metrics. The Efron primary-text locator remains unverified, and no guidebook bootstrap derivation is invented.

<details><summary>Evidence notes</summary>

- **Holistic Evaluation of Language Models (HELM, Liang et al., 2022)**: licensing: Attribution license; cited only.
  - pedagogical_quality 3: Long report with a clear taxonomy.
  - coverage 5: Scenarios, metrics, standardised prompting.
  - clarity 3: Very long.
  - exercises 1: No exercises.
  - currency 4: 2022 with a maintained leaderboard.
  - accessibility 5: Free PDF.
  - relevance 4: Frames the multi-metric reporting on Day 70.
- **Measuring Massive Multitask Language Understanding (MMLU) with GSM8K**: licensing: Cited only; dataset items are not copied.
  - pedagogical_quality 3: Benchmark papers.
  - coverage 4: Define the tasks and scoring the block reproduces.
  - clarity 4: Short papers.
  - exercises 1: No exercises.
  - currency 3: 2020-2021; known saturation and contamination issues.
  - accessibility 5: Free PDFs.
  - relevance 5: Day 70 scorers follow their answer formats.
- **SQuAD (Rajpurkar et al., 2016)**: licensing: Cited only.
  - pedagogical_quality 3: Benchmark paper.
  - coverage 3: Defines exact match and token F1.
  - clarity 4: Short paper.
  - exercises 1: No exercises.
  - currency 3: Published 2016.
  - accessibility 5: Free PDF.
  - relevance 5: Day 71 EM and F1 normalisation.
- **EleutherAI LM Evaluation Harness**: licensing: Linking only.
  - pedagogical_quality 2: Tool documentation.
  - coverage 5: Hundreds of tasks with shared scoring.
  - clarity 3: Large configuration surface.
  - exercises 1: No exercises.
  - currency 5: Actively maintained.
  - accessibility 4: Free; needs model weights to run.
  - relevance 3: Useful to compare against, but hides the scoring the block teaches.
- **SuperGLUE (Wang et al., 2019)**: licensing: Cited only.
  - pedagogical_quality 3: Benchmark paper.
  - coverage 3: Classification-style tasks.
  - clarity 4: Readable prose.
  - exercises 1: No exercises.
  - currency 2: 2019; saturated.
  - accessibility 5: Free PDF.
  - relevance 2: Task style differs from generative evaluation.
- **Hugging Face LLM Evaluation Guidebook (legacy edition)**: licensing: Repository LICENSE verified; noncommercial/share-alike affects reuse, not teaching merit. Linking only.
  - pedagogical_quality 5: Beginner/advanced routes explain practical dataset, prompt, metric and evaluator choices rather than only defining a benchmark.
  - coverage 5: Covers held-out evaluation, contamination, prompts, metrics, judges and reproducibility; exact formulas remain paper references.
  - clarity 4: Readable Markdown and concrete checklists; some claims require local qualification.
  - exercises 2: Suggested audits and comparisons, but no graded notebook or answer-keyed exercise sequence.
  - currency 1: README explicitly says no longer maintained; replacement Space content was not verified as the guidebook.
  - accessibility 4: Public lightweight Markdown; stale replacement pointer and external links may fail, independently of license terms.
  - relevance 5: Stable methodological chapters map to Days 70-72 honesty, metric choice and reproducible reporting; not tooling-version advice.

</details>

## Tool-using agents, recovery and delivery engineering (Days 73-81)

| Candidate | Ped | Cov | Clr | Ex | Cur | Acc | Rel | License |
|---|---|---|---|---|---|---|---|---|
| [ReAct (Yao et al., 2022)](https://arxiv.org/abs/2210.03629) (selected) | 3 | 4 | 4 | 1 | 3 | 5 | 5 | Open Access / CC BY 4.0 |
| [Anthropic: Tool use documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) (selected) | 3 | 4 | 4 | 1 | 5 | 4 | 4 | Anthropic PBC copyright (no open license) |
| [Site Reliability Engineering book (Google): Cascading Failures, Release Engineering, Postmortem Culture](https://sre.google/sre-book/addressing-cascading-failures/) (selected) | 4 | 4 | 4 | 1 | 3 | 5 | 5 | CC BY-NC-ND 4.0 |
| [Reflexion (Shinn et al., 2023)](https://arxiv.org/abs/2303.11366) (selected) | 3 | 3 | 4 | 1 | 4 | 5 | 4 | Open Access / CC BY 4.0 |
| [Google Gemini API: Function calling](https://ai.google.dev/gemini-api/docs/function-calling) | 3 | 4 | 4 | 1 | 5 | 4 | 3 | CC BY 4.0 (content) / Apache-2.0 (code samples) |
| [Hugging Face Agents Course: Introduction to Agents](https://huggingface.co/learn/agents-course/en/unit1/introduction) (selected) | 5 | 3 | 4 | 4 | 4 | 4 | 4 | Apache-2.0 |

**Selected:** `huggingface-agents-course`, `yao-react-2022`, `anthropic-tool-use-docs`, `google-sre-cascading-failures`, `google-sre-release-engineering`, `shinn-reflexion-2023`
<br>**Teaching:** `huggingface-agents-course`, `google-sre-cascading-failures`, `google-sre-release-engineering`
<br>**Definition/API reference:** `yao-react-2022`, `anthropic-tool-use-docs`, `shinn-reflexion-2023`
<br>**Also cited:** `langgraph-persistence-docs`, `yang-swe-agent-2024`

**Rationale:** Add a staged agent introduction and quiz before ReAct/API definitions; retain SRE teaching for durability and delivery. Provider protocols are not interchangeable, and course examples do not certify local sandbox safety. Gemini remains a valid compared protocol guide, not a lower-quality source merely because it is a different vendor.

<details><summary>Evidence notes</summary>

- **ReAct (Yao et al., 2022)**: licensing: Attribution license; cited only.
  - pedagogical_quality 3: Research paper with clear trace examples.
  - coverage 4: Thought-action-observation loop and evaluations.
  - clarity 4: Readable prose.
  - exercises 1: No exercises.
  - currency 3: 2022; agent practice has moved fast since.
  - accessibility 5: Free PDF.
  - relevance 5: Day 73 loop structure.
- **Anthropic: Tool use documentation**: licensing: Proprietary docs; linking only.
  - pedagogical_quality 3: Task-oriented developer guide.
  - coverage 4: Tool definitions, tool_use and tool_result blocks.
  - clarity 4: Clear examples.
  - exercises 1: No exercises.
  - currency 5: Maintained with the API.
  - accessibility 4: Free online; vendor-specific.
  - relevance 4: Message format for the Day 74 tool-call drills.
- **Site Reliability Engineering book (Google): Cascading Failures, Release Engineering, Postmortem Culture**: licensing: Noncommercial, no derivatives; chapters linked, never adapted.
  - pedagogical_quality 4: Practitioner chapters with case studies.
  - coverage 4: Retries, overload, release process, postmortems.
  - clarity 4: Readable chapters.
  - exercises 1: No exercises.
  - currency 3: Published 2016; practices still widely used.
  - accessibility 5: Free online.
  - relevance 5: Days 76-81 retry budgets, release gates and postmortems.
- **Reflexion (Shinn et al., 2023)**: licensing: Cited only.
  - pedagogical_quality 3: Research paper.
  - coverage 3: Self-reflection loop with memory.
  - clarity 4: Readable prose.
  - exercises 1: No exercises.
  - currency 4: Published 2023.
  - accessibility 5: Free PDF.
  - relevance 4: Day 75 retry-with-feedback pattern.
- **Google Gemini API: Function calling**: licensing: Linking only.
  - pedagogical_quality 3: Developer guide.
  - coverage 4: Function declarations and call loop.
  - clarity 4: Clear examples.
  - exercises 1: No exercises.
  - currency 5: Maintained with the API.
  - accessibility 4: Free online; vendor-specific.
  - relevance 3: Equivalent to the selected docs; one vendor format is enough.
- **Hugging Face Agents Course: Introduction to Agents**: licensing: First-party huggingface/agents-course LICENSE is Apache-2.0; external links only.
  - pedagogical_quality 5: Unit 1 builds agent, model, tool and control-loop concepts before a summary and quiz.
  - coverage 3: Covers agent fundamentals, not the complete Days 76-81 durability, security and delivery work.
  - clarity 4: Short sequenced explanations; framework examples must not be treated as universal protocols.
  - exercises 4: Quizzes and hands-on course units; local bounded exercises remain the acceptance evidence.
  - currency 4: Public current course checked; rapidly changing frameworks remain a re-verification risk.
  - accessibility 4: Free reading; hosted exercises can require model or platform access.
  - relevance 4: Introductory loop supports Day 73; no-private-reasoning local trace policy and SRE work remain distinct.

</details>

## Agent evaluation, reporting and capstone (Days 82-90)

| Candidate | Ped | Cov | Clr | Ex | Cur | Acc | Rel | License |
|---|---|---|---|---|---|---|---|---|
| [SWE-bench (Jimenez et al., 2024)](https://arxiv.org/abs/2310.06770) (selected) | 3 | 4 | 4 | 1 | 4 | 5 | 5 | Open Access / CC BY 4.0 |
| [AgentBench (Liu et al., 2023)](https://arxiv.org/abs/2308.03688) (selected) | 3 | 4 | 3 | 1 | 3 | 5 | 4 | Open Access / CC BY 4.0 |
| [tau-bench (Yao et al., 2024)](https://arxiv.org/abs/2406.12045) (selected) | 3 | 3 | 4 | 1 | 4 | 5 | 5 | Open Access / CC BY 4.0 |
| [OpenAI Evals](https://github.com/openai/evals) (selected) | 3 | 3 | 3 | 1 | 3 | 5 | 4 | MIT |
| [GAIA: a benchmark for General AI Assistants (Mialon et al., 2023)](https://arxiv.org/abs/2311.12983) | 3 | 3 | 4 | 1 | 4 | 5 | 2 | Open Access (arXiv) |
| [Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents) (selected) | 4 | 4 | 4 | 2 | 5 | 5 | 5 | Anthropic copyright; no open reuse license verified |

**Selected:** `anthropic-agent-evals-2026`, `jimenez-swe-bench-2024`, `liu-agentbench-2023`, `yao-taubench-2024`, `openai-evals-framework`
<br>**Teaching:** `anthropic-agent-evals-2026`
<br>**Definition/API reference:** `jimenez-swe-bench-2024`, `liu-agentbench-2023`, `yao-taubench-2024`, `openai-evals-framework`
<br>**Also cited:** `mitchell-model-cards-2019`, `zhou-webarena-2023`, `yao-react-2022`

**Rationale:** Add a teaching-oriented evaluation workflow before benchmark definitions. Retain SWE-bench acceptance-test structure, AgentBench failure analysis, tau-bench Section 3 reliability and the Evals spec layout as distinct reference roles. GAIA targets external browsing absent from the local sandbox; practitioner advice is not an independent validation of the capstone.

<details><summary>Evidence notes</summary>

- **SWE-bench (Jimenez et al., 2024)**: licensing: Attribution license; cited only.
  - pedagogical_quality 3: Benchmark paper with clear task construction.
  - coverage 4: Issue-to-patch tasks with FAIL_TO_PASS tests.
  - clarity 4: Readable prose.
  - exercises 1: No exercises.
  - currency 4: 2023-2024; Verified and multilingual variants followed.
  - accessibility 5: Free PDF; harness is MIT.
  - relevance 5: Capstone acceptance tests use the same fail-to-pass idea.
- **AgentBench (Liu et al., 2023)**: licensing: Cited only.
  - pedagogical_quality 3: Benchmark paper.
  - coverage 4: Eight environments and failure analysis.
  - clarity 3: Dense results tables.
  - exercises 1: No exercises.
  - currency 3: Published 2023.
  - accessibility 5: Free PDF.
  - relevance 4: Failure categories used for the Day 82-84 trace review.
- **tau-bench (Yao et al., 2024)**: licensing: Cited only.
  - pedagogical_quality 3: Benchmark paper.
  - coverage 3: Tool-agent-user tasks and pass^k reliability.
  - clarity 4: Readable prose.
  - exercises 1: No exercises.
  - currency 4: Published 2024.
  - accessibility 5: Free PDF.
  - relevance 5: pass^k is the reliability metric used in the capstone.
- **OpenAI Evals**: licensing: Linking only.
  - pedagogical_quality 3: README-driven framework guide.
  - coverage 3: Eval registry, templates and runners.
  - clarity 3: Docs are spread across files.
  - exercises 1: No exercises.
  - currency 3: Last commit April 2026 (GitHub API, checked 2026-11-01).
  - accessibility 5: Free to read online.
  - relevance 4: Eval-spec structure for Day 83.
- **GAIA: a benchmark for General AI Assistants (Mialon et al., 2023)**: licensing: Cited only.
  - pedagogical_quality 3: Benchmark paper.
  - coverage 3: Assistant tasks with short exact answers.
  - clarity 4: Readable prose.
  - exercises 1: No exercises.
  - currency 4: Published 2023.
  - accessibility 5: Free PDF.
  - relevance 2: Web-browsing tasks fall outside the sandboxed capstone.
- **Demystifying evals for AI agents**: licensing: Public practitioner article linked only; no general reproduction permission inferred.
  - pedagogical_quality 4: Explains task/trial/grader/outcome concepts then offers a staged workflow for building evaluations.
  - coverage 4: Covers graders, multiple trials, capability/regression suites and practical failure modes; not the complete portfolio.
  - clarity 4: Examples and distinctions aid beginners; commercial perspective is explicit.
  - exercises 2: Actionable audit/checklist work, but no formal exercise set or reference solutions.
  - currency 5: Published 2026-01-09 and inspected; the date is not itself proof of quality.
  - accessibility 5: Free article; its conceptual design advice requires no paid API.
  - relevance 5: Task/trial/outcome and grader choices map directly to Days 82-83; exact pass^k still comes from tau-bench Section 3.

</details>
