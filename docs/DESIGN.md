# myPKR design and language

Established October 9, 2026, from the owner's request to incorporate the **my**
positioning throughout the content and make it part of the design going forward.

## Product position

**myPKR · Personal Knowledge Record**

**My life. My words. My record.**

A personal place to keep memories, documents, and decisions connected to their
sources. The owner chooses what to bring into the record and what to ask about
it. The design should feel like opening one's own record, with familiar language
and a clear view of where information came from.

“My” communicates the owner's relationship with their collection. It does not
mean they authored every source, that a recollection has been verified, or that
the product contains everything about their life. It is not a claim about legal
ownership of third-party material. Keep the person's words and the words of
their sources distinguishable.

## Voice and point of view

Use **my** for owner-facing destinations and actions. Use **your** when the app
explains, guides, or reports a result. Keep familiar controls such as Close,
Sign out, and Newest first. Do not insert “my” into every noun or sentence.
The app never speaks as if it personally remembers the owner's life.

| Surface | Preferred language | Purpose |
| --- | --- | --- |
| Product name | myPKR | Lowercase “my,” uppercase “PKR”; one word |
| Descriptor | Personal Knowledge Record | Explain the initials without renaming the app |
| Home / search destination | My record | The owner's collection is the main destination |
| Search action | Search my record | Make the scope and ownership clear |
| Capture destination | Add to myPKR | Retain the recognizable capture phrase |
| Capture action | Prepare my request | Describe what the current composer actually does |
| Sources destination | My sources | The sources in the owner's collection |
| Decisions destination | My decisions | Decisions and corrections kept in the record |
| AI destination | Ask AI | Clearly identify AI assistance |
| AI heading | Ask about my record | Connect the question to the owner's saved material |
| AI preview action | Review my evidence | Put source review before external processing |
| Guidance | Choose what you want to keep in your record. | Address the person directly |
| Prepared status | Your request is ready. It has not been sent or saved to your record. | Distinguish preparation from a save |

Write calmly and directly. Use everyday terms: saved records, earlier versions,
where information came from. Explain technical terms only when needed to make
a choice or interpret a result. Keep dates, verification status, source coverage,
and save status precise. Make errors recoverable with a useful next step.

## Interaction structure

1. **Open my record.** Keep unlock prominent and compact. Avoid marketing panels
   that push sign-in below the fold. Fingerprint/passkey behavior must reflect
   actual device and service readiness; see `PASSKEYS.md`.
2. **Find what matters.** Search saved material, then expand a dated record to
   read the source. Explain that missing results do not establish that an event
   did not happen or that unimported files contain no relevant information.
3. **Choose what to keep.** Capture the owner's account, supplied sources,
   approximate dates, and uncertainty separately. Review the prepared request
   before the explicit ChatGPT handoff. Label a save only after it is verified.
4. **Understand the source.** Preserve original words, locators, authorship,
   version history, and recorded status. Group matching passages by record ID.
5. **Decide when to use AI.** Show the selected evidence and external provider
   before approval. Keep the question and generated interpretation distinct from
   the original record; an answer is not automatically a saved fact.

Future features should follow this structure. Describe a proposed capability
as planned until it is implemented and verified. Do not imply that sharing,
deletion, complete exports, offline access, or automatic synchronization exists
merely because the product emphasizes personal control.

## Visual structure

- Keep the established navy, teal, and warm-white palette, with dark appearance
  driven by system settings. Use teal to give the “my” wordmark prefix a subtle
  emphasis; keep the name contiguous and readable to assistive technology.
- Preserve the existing app icon and installation identity. The wordmark is
  **myPKR**, while the small icon may retain readable **PKR** lettering.
- Use one clear page heading, a short supporting sentence, and the primary
  action. Keep the positioning line brief; avoid large introductory panels.
- Use the shared compact dated rows and expansion controls for records, sources,
  decisions, and AI evidence. Keep mobile touch targets usable despite density.
- Keep source details available through progressive disclosure. Never hide
  uncertainty, consent, or whether a record was actually saved.
- Do not add personal names or family details to public static assets. Personal
  content appears only after authorization and comes from the private record.

## Review for future changes

Check that the screen centers the owner's task; labels use a consistent point
of view; source material is untouched; actions and status describe real behavior;
and the existing compact layout, accessibility, privacy controls, and evidence
distinctions remain intact. Update this guide when the owner changes direction.

This guide governs product presentation. It does not change authentication,
database permissions, import schemas, or the wording of historical records.
