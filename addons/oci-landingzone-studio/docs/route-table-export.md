# Route-table Draw.io export bounds

Route-table HTML uses the same content dimensions as the React diagram. Its
Draw.io cell must use `overflow=fill` with zero spacing. The default Draw.io text
layout adds an implicit top offset even with `spacingTop=0`; native SVG/PNG
exports then place final route rows below their calculated cell border.

Keep the fill behavior in the producer rather than increasing arbitrary footer
space or modifying generated drawings. It aligns the HTML with the cell bounds
and preserves the route text, row count, diagram placement and generated network
configuration. Unit tests preserve the cell style, and native Draw.io export
plus browser geometry measurements exercise the renderer-specific behavior.
