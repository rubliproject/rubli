# Backlog: Focos Rojos «sea of dots» audit + Fable redesign (owner, 2026-10-29). LATER.

## ▶ Owner brief, 2026-11-03 (this supersedes the concepts below and the 11-02 «mapa» / «puertas» rounds)

**Status: QUEUED.** The owner said: «don't do the ARIA redesign just now». It runs as one Fable design round only when he says go. After that, Opus or Sonnet executes.

**The owner's verdict:** /aria «looks horrible… not presentable». He'd rather go back to what we had than ship the 11-02 concepts.

**The crux, in his words:** think as a user. The information is so dense that a reader handed 100 companies asks «which one am I supposed to look at?». So give the reader agency, and present it in a friendly way that makes people want to navigate.

**The model to follow is El Mapa's constellation:**
- sectors divided by colour;
- you zoom in or not, as you like;
- prominent names stand out («this one looks more interesting because it has more points / more risk»).

**What to build:**
1. **Organize the spheres (the per-vendor firmas)** so the reader chooses the axis:
   - by pattern («trend»: institutional capture, etc.);
   - by sector;
   - or a cross of pattern × sector.

   «I don't think we have to think about it that much.»
2. **Two views of the same set:**
   - the **graphic** one (constellation-like);
   - a **list** like El Mapa's, to sort through them.
3. **Owner, later on 11-03:** «I want something bold… let's just follow the recipe from El Mapa. I guess it's the easiest way… I'm just overcomplicating it.» So: El Mapa's recipe first, with the boldness in execution, not in a new metaphor.
4. **Owner, 11-03 evening:** the entry is the reader's question, «who is the vendor that benefited the most in an administration, or in the sector, or in these types of scenarios?» So Focos Rojos opens with scenario filters (sexenio × sector × institution × pattern), and the answer is a ranking of who benefited: money received plus the indicator, with the constellation and list as two views of that answer. The data partly exists already (`category_sexenio_flows.top_vendors`, the sexenio dossiers, `aria_queue`).
5. **The visual presentation must be professional, not AI slop.** Use the rubli-ui skills (or anything better, if needed), on El Mapa's real components, tokens and sector colours. Run an independent review, then the owner sees screenshots.

The owner (photo of /aria, the «proveedores que ningún caso público nombra todavía… 339,450 MDP» grid) asked: «I need an audit on how we are presenting data in Red Flags. Given our new design capabilities, should we change how we present the sea of dots? Explore with Fable later.»

## First read (coordinator, from the photo; to be confirmed by the audit)
- **Encoding:** each vendor is a small polar glyph (angle = year, radius = amount, filled = direct award, colour = contract indicator). Polar time is hard to read; glyphs look alike at a glance, so a reader can't compare vendors without studying each one.
- **Colour:** nearly every mark is red or orange, which goes against the quiet-palette rule (red only for crítico). The whole wall reads as alarm, so nothing stands out.
- **Ranking:** neighbouring scores are almost identical (0.67, 0.67, 0.66…). The order implies more precision than exists; tiers or bands would be more honest.
- **Density:** many small multiples with uneven name lengths; names wrap to 1–3 lines, so card heights and baselines vary.
- **What works:** the small-multiples idea, the per-vendor «firma», the search and sort modes, the blue/brown case markers.

## For the audit
Check that each encoding answers the five reader questions (what · simple · motion · look closer · why), measure colour use against the palette rules, verify that the ranking granularity is justified by the score's precision, and run the a11y and phone checks. Compare with the approved object language (sculptural objects; `feedback_sculptural_objects_direction`).

## For the Fable round
Directions to explore: a vendor signature as an object (e.g. a small Judd stack or Brancusi module per vendor in the same language as the dossiers); a field where position carries meaning (time × amount) instead of a grid of identical cards; tiers or bands instead of a 0.01-step ranking; red reserved for the few crítico. Keep the docket-first structure (deployed 17b6387b).
