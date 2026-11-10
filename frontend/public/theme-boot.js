// Night edition before first paint (no flash). Mirrors src/lib/theme.ts apply(): night is opt-in,
// read from localStorage 'rubli-edition'; anything else stays day. External file: CSP is script-src 'self'.
(function () {
  try {
    if (localStorage.getItem('rubli-edition') === 'night') {
      document.documentElement.dataset.theme = 'night'
      var m = document.querySelector('meta[name="theme-color"]')
      if (m) m.setAttribute('content', '#000000')
    }
  } catch (e) { /* storage blocked: day */ }
})()
