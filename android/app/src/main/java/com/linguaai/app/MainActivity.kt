    override fun onCreate(s: Bundle?) {
        super.onCreate(s)
        api = LinguaAIApi(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        window.statusBarColor = cEm
        buildUI()
        handleSharedText(intent)
    }
    override fun onNewIntent(i: Intent) { super.onNewIntent(i); handleSharedText(i) }
    override fun onResume() { super.onResume(); updateA11yStatus() }

    private fun handleSharedText(i: Intent?) {
        if (i?.action == Intent.ACTION_SEND && i.type == "text/plain") {
            val t = i.getStringExtra(Intent.EXTRA_TEXT) ?: ""
            if (t.isNotEmpty()) { editor.setText(t); currentText = t; editor.setSelection(t.length); toast("Analyzing..."); triggerAnalyze() }
        }
    }
