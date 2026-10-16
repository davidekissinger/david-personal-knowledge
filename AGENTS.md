# myPKR project conventions

Read `docs/DESIGN.md` before changing product language, navigation, interaction,
or visual design. The user's direction is to make the **my** in **myPKR** part of
the product's continuing structure: personal ownership, voice, context, and choice.
Apply that direction to new work as well as existing screens.

Keep the exact brand `myPKR` and descriptor `Personal Knowledge Record`. Use
first-person labels for the owner's places and choices; address the owner as
“you” in guidance. Source quotations, imported records, names, dates, citations,
and verification status are evidence, not brand copy: never rewrite them to fit
the voice. Preserve distinctions among drafted, prepared, pending, and saved.

Use the existing compact dated rows, shared expansion controls, system-driven
dark appearance, and navy/teal/warm-white palette. Preserve accessibility and
clear disclosure of external AI processing. Read the relevant implementation
docs before changing authentication, imports, or AI behavior.

Run `npm run check` for the existing release gate. Copy-only edits do not need
new tests that assert wording. Update the design guide when the user changes
the product direction. Never commit personal records or credentials.

## Foundation: modular upgrades and personal vault portability

Before changing onboarding, subscriptions, feature gates, OAuth/source connectors,
tenant identity, vault routing, import/export, billing, migrations, or AI entitlement
rules, read `docs/ADR-001-MODULAR-VAULTS-AND-UPGRADES.md` alongside
`docs/DESIGN.md` and the relevant current implementation guide.

The two axes are independent: **capabilities** (Personal/Plus and future modules)
and **infrastructure** (Managed Shared / Managed Dedicated / Customer Operated).
The portable vault is the ownership boundary; code repositories and cloud
projects are not mandatory customer accounts. Access control, provenance,
self-service export and deletion controls are baseline product requirements,
not paid privileges. Do not claim unimplemented items are available.

All premium enforcement belongs server-side and remains subordinate to actor,
vault, consent and quota checks. Never remove or bypass the existing owner gate
until multi-user tests prove the replacement safe. Documentation of an upgrade
flow is not authorization to provision cloud resources or move private records.
