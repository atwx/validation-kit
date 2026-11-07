# Turning inputs into sources and requirements

| Input | As source | Requirements |
|---|---|---|
| Specification, work instruction, SOP (docx/pdf) | `file` + outline from the table of contents | Quote sentences with “must/shall/may only”; one requirement each. |
| Regulation, standard (e.g. 21 CFR Part 11, ISO 13485) | Outline of the clauses; text in `sources/text/` when freely available, else `quote_type: paraphrase` | Only clauses that apply to the system; note the applicability. |
| Task map / process spreadsheet (roles × tasks) | Export to text: one section per row (`no` = row key, `title` = task) | Only when current and confirmed by the client. One requirement per task a role must be able to do, plus rules stated in the cells. An outdated one is background, not a source. |
| Interviews, workshops | One source per session, no sections | `quote_type: paraphrase`; confirm with the client. |
| Legacy code | Evidence when documents exist; **the source** when it is the only reliable description (`kind: code`, see [catalogue.md](catalogue.md#code-as-source), [domain.md](domain.md)) | With documents: evidence for `legacy.status`; implicit rules – ask whether they are wanted. Without: one requirement per business rule, calculation, state change, output and list. |
| Legacy data | Not a source | Evidence (counts, fill rates, anomalies: what is really used); test data; golden files for calculations. |
| Existing tests of the legacy system | Not a source | Reuse as flow tests: annotate with requirement ids. |
| Change orders of the client | One source per order | Target `change` in the inventory. |

## Spreadsheet to source text

For an .ods/.xlsx task map, write a small script that exports one line block
per row to `sources/text/<ID>.txt` and the outline to `sources.yml`, e.g.

```
3.2 Create invoice (Office)
Office creates the monthly invoice for every family with a contract.
```

so quotes from cells can be checked verbatim. Keep the script in
`validation/scripts/` and the spreadsheet itself out of git when it holds client data.
