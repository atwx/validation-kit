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

Text for the quote check, in this order: `sources/text/<id>.txt`, then `file`
(.md/.txt read as is, .pdf via `pdftotext`, everything else via `pandoc`,
cached in `.cache/sources/`). Without text, `vkit check` warns and skips the quote.

## requirements/NN-area.yml

```yaml
area: Approval
prefix: FG                     # every id in this file starts with FG-
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
