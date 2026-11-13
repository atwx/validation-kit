# Catalogue: sources and requirements

## sources/sources.yml

```yaml
- id: AA                       # short id, used in requirements
  title: "Work instruction document maintenance, rev. B"
  file: docs/AA-rev-B.docx     # relative to paths.sourceFiles (default: ..)
  revision: B
  url: https://…               # optional
  sections:                    # the document's own outline
    - { no: "1", title: "Purpose" }
    - { no: "4.1", title: "Access rights" }
- id: INT
  title: Interviews with the front desk, May 2026
  sections: []                 # no outline: requirements cite it without section
```

### Code as source

When the legacy code is the only reliable source (no specification, or an
outdated one), register the source tree:

```yaml
- id: DJ
  title: Legacy application (Django)
  kind: code
  root: django_root              # relative to paths.sourceFiles
  revision: 83ddf69              # commit the quotes refer to
  url: https://github.com/org/repo/blob/{revision}/django_root/{file}#L{line}   # optional
  exclude: [migrations/, tests/] # optional; extensions: [.py, .html] to narrow
```

Every file is a section. A citation names the file and quotes the code
verbatim (one or more lines, YAML block scalar for several):

```yaml
    sources:
      - doc: DJ
        section: glasmacher/models/invoice.py
        quote: |
          if student.sibling:
              rate = school.commission_sibling
```

`vkit check` checks the quote against that file; the report shows the line
and links to it. The source page lists all files, so it shows which parts of
the code no requirement covers yet.

Text for the quote check, in this order: `sources/text/<id>.txt`, then `file`
(.md/.txt read as is, .pdf via `pdftotext`, everything else via `pandoc`,
cached in `.cache/sources/`). Without text, `vkit check` warns and skips the quote.

## requirements/NN-area.yml

```yaml
area: Approval
prefix: FG                     # every id in this file starts with FG-
level: business                # optional, one of `levels` in vkit.config.mjs
description: Approval of documents by process owners
requirements:
  - id: FG-013
    title: Rejected requests stay on record
    risk: high                 # one of `risks` in vkit.config.mjs
    sources:
      - doc: AA
        section: "17.3"        # an outline entry, or a paragraph of it: "11.300(b)"
        quote: "…"             # verbatim
      - doc: ISO13485
        section: "4.2.5"
        quote_type: paraphrase # original text not available
        quote: "…"
    acceptance: >
      A rejection closes the request with status “rejected”; request and comments stay stored.
    note: "…"                  # optional, e.g. a contradiction between sources
    level: ui                  # optional, overrides the file's level
    legacy:                    # only when shown for the legacy system
      status: not_met          # met | partial | not_met
      evidence:
        - "Code: removeApprovalRequest() deletes the request (app/src/ApprovalList.php:212)"
        - "Data: 0 rejected requests in the table although 31 rejections in the log"
```

`vkit check` reports: id not matching the prefix, duplicate ids, missing
title/risk/acceptance/sources, unknown risk, unknown source or section, missing
quote, quote not found verbatim (after normalising whitespace, dashes, Markdown
emphasis and soft hyphens), legacy status without evidence.

## Writing good requirements

- Atomic: one observable behaviour. “The list can be sorted and filtered” is two.
- Testable: the acceptance criterion says what a tester sees, with concrete values
  where the source has them (“after 28 days”, “at most five”).
- Traceable: at least one source; derived requirements cite the source they derive from.
- Neutral to the implementation: no class names or screens of the new system.
- When derived from code, state the business rule, not the code: “Siblings are
  invoiced with the sibling commission rate”, not “invoice() reads commission_sibling”.

Optional fields when the project has a domain model ([domain.md](domain.md)):
`domain` (concepts), `variants` (default: all), `realisation` (core, config, extension).

## Levels

Requirements can belong to levels, e.g. the business behaviour and the operating
structure (navigation, sub-pages, actions per page). Configure them in
`vkit.config.mjs`; without `levels` nothing changes.

```js
levels: [{ id: 'business', title: 'Business' }, { id: 'ui', title: 'Operating structure' }],
```

A file sets `level:` at the top, a requirement may override it, the default is the
first level. `vkit check` rejects unknown level ids. The progress (see behaviour.md)
is then also shown per level and variant: in `vkit status` as
"City library: Business 100 %, Operating structure 14 %, total 93 %", in the HTML
report and the FriendlyBase overview as a table "By level". The FriendlyBase package
gives every requirement the property `level` (`ebene` in German) and a board "By level".
