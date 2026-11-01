package io.github.maiakitty.jellyshelf

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.util.zip.ZipFile

/**
 * Where downloads live: the app's own storage, or a folder you picked (Storage Access Framework). Paths are relative,
 * "Manga/Chainsaw Man/Chainsaw Man - Ch. 053.cbz", the same layout either way.
 */
interface Store {
    val label: String
    fun output(path: String, append: Boolean): OutputStream
    /** Bytes on disk, or -1 when it isn't there. */
    fun length(path: String): Long
    fun input(path: String): InputStream?
    fun delete(path: String)
    /** For the video player. */
    fun uri(path: String): Uri
    /** A real file, when the store has one (the app's own storage): opens a CBZ without copying it. */
    fun file(path: String): File?
}

class FileStore(private val root: File) : Store {
    override val label = "In the app"
    private fun f(path: String) = File(root, path)
    override fun output(path: String, append: Boolean): OutputStream = f(path).also { it.parentFile?.mkdirs() }.let { FileOutputStream(it, append) }
    override fun length(path: String) = f(path).let { if (it.exists()) it.length() else -1L }
    override fun input(path: String) = f(path).takeIf { it.exists() }?.let { FileInputStream(it) }
    override fun delete(path: String) {
        val file = f(path)
        file.delete()
        // Drop the series folder once its last file is gone.
        file.parentFile?.takeIf { it != root && it.list()?.isEmpty() == true }?.delete()
    }
    override fun uri(path: String): Uri = Uri.fromFile(f(path))
    override fun file(path: String) = f(path)
}

class TreeStore(private val ctx: Context, private val tree: Uri) : Store {
    override val label: String = Uri.decode(tree.lastPathSegment ?: "").substringAfter(':').ifEmpty { "Phone storage" }.let { "Folder: $it" }
    private val resolver get() = ctx.contentResolver
    // Path → document id, so walking a path doesn't query the provider every time.
    private val ids = HashMap<String, String>()

    private fun child(parentId: String, name: String): String? {
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId)
        resolver.query(children, arrayOf(Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { c ->
            while (c.moveToNext()) if (c.getString(1) == name) return c.getString(0)
        }
        return null
    }

    /** The document id at `path`, creating folders (and the file, with `create`) on the way. */
    @Synchronized
    private fun find(path: String, create: Boolean): String? {
        ids[path]?.let { return it }
        var id = DocumentsContract.getTreeDocumentId(tree)
        val parts = path.split('/')
        parts.forEachIndexed { i, name ->
            val sub = parts.take(i + 1).joinToString("/")
            id = ids[sub] ?: child(id, name) ?: run {
                if (!create) return null
                val mime = if (i == parts.lastIndex) "application/octet-stream" else Document.MIME_TYPE_DIR
                DocumentsContract.createDocument(resolver, DocumentsContract.buildDocumentUriUsingTree(tree, id), mime, name)
                    ?.let { DocumentsContract.getDocumentId(it) } ?: return null
            }
            ids[sub] = id
        }
        return id
    }

    private fun doc(path: String, create: Boolean = false) = find(path, create)?.let { DocumentsContract.buildDocumentUriUsingTree(tree, it) }

    override fun output(path: String, append: Boolean): OutputStream =
        resolver.openOutputStream(doc(path, create = true) ?: error("Can't write to the download folder"), if (append) "wa" else "wt")
            ?: error("Can't write to the download folder")

    override fun length(path: String): Long {
        val d = doc(path) ?: return -1
        return resolver.query(d, arrayOf(Document.COLUMN_SIZE), null, null, null)?.use { if (it.moveToFirst()) it.getLong(0) else -1 } ?: -1
    }

    override fun input(path: String) = doc(path)?.let { runCatching { resolver.openInputStream(it) }.getOrNull() }

    @Synchronized
    override fun delete(path: String) {
        doc(path)?.let { runCatching { DocumentsContract.deleteDocument(resolver, it) } }
        ids.keys.removeAll { it == path || it.startsWith("$path/") }
    }

    override fun uri(path: String) = doc(path) ?: Uri.EMPTY
    override fun file(path: String): File? = null
}

/**
 * Everything downloaded (and queued), kept as `jellyshelf-downloads.json` next to the files, so a picked folder carries
 * its own list. Also the queue of progress made offline, sent to the server once it's reachable again.
 */
object Library {
    private const val INDEX = "jellyshelf-downloads.json"
    private const val PREFS = "jellyshelf"
    private const val KEY_TREE = "storageTree"

    lateinit var store: Store
        private set
    private lateinit var appContext: Context
    /** key → item (JSON as the web app sent it, plus state, file, bytes, total, position, read/watched). */
    val items = LinkedHashMap<String, JSONObject>()
    /** Progress made offline, waiting for the server: {"type":"manga",anilistId,chapter} / {"type":"video",itemId,position,duration}. */
    val pending = ArrayList<JSONObject>()

    @Synchronized
    fun init(ctx: Context) {
        if (::appContext.isInitialized) return
        appContext = ctx.applicationContext
        load()
    }

    @Synchronized
    fun load() {
        val tree = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TREE, null)
        store = tree?.let { TreeStore(appContext, Uri.parse(it)) } ?: FileStore(File(appContext.filesDir, "downloads"))
        items.clear()
        pending.clear()
        val json = runCatching { store.input(INDEX)?.use { it.readBytes().decodeToString() } }.getOrNull() ?: return
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        o.optJSONObject("items")?.let { all -> all.keys().forEach { k -> items[k] = all.getJSONObject(k) } }
        o.optJSONArray("pending")?.let { a -> for (i in 0 until a.length()) pending.add(a.getJSONObject(i)) }
        // Downloads cut short by the app being closed carry on (from where they stopped) next time.
        items.values.filter { it.optString("state") == "downloading" }.forEach { it.put("state", "queued") }
    }

    /** Switch where downloads go: a picked folder, or null for the app's own storage. The other place's files stay. */
    @Synchronized
    fun useFolder(tree: Uri?) {
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
            if (tree == null) remove(KEY_TREE) else putString(KEY_TREE, tree.toString())
        }.apply()
        load()
    }

    @Synchronized
    fun save() {
        val o = JSONObject()
            .put("items", JSONObject().also { all -> items.forEach { (k, v) -> all.put(k, v) } })
            .put("pending", JSONArray(pending))
        store.output(INDEX, append = false).use { it.write(o.toString().toByteArray()) }
    }

    /** Queue something the web app asked for (a repeat of something already there or queued is ignored). */
    @Synchronized
    fun enqueue(item: JSONObject): Boolean {
        val key = item.getString("key")
        val have = items[key]
        if (have != null && have.optString("state") != "failed") return false
        item.put("state", "queued").put("bytes", 0).put("added", System.currentTimeMillis())
        item.put("file", have?.optString("file")?.ifEmpty { null } ?: pathFor(item))
        items[key] = item
        save()
        return true
    }

    @Synchronized
    fun next(): JSONObject? = items.values.firstOrNull { it.optString("state") == "queued" }

    @Synchronized
    fun remove(key: String) {
        val it = items.remove(key) ?: return
        runCatching { store.delete(it.getString("file")) }
        // The poster goes once nothing in its group is left.
        val group = it.optString("group")
        if (items.values.none { o -> o.optString("group") == group }) runCatching { store.delete(posterPath(group)) }
        save()
    }

    /** What the web app shows on its download buttons: key → {state, progress}. */
    @Synchronized
    fun status(): String {
        val o = JSONObject()
        items.forEach { (k, v) ->
            val total = v.optLong("total", 0)
            o.put(k, JSONObject().put("state", v.optString("state")).put("progress", if (total > 0) v.optLong("bytes") / total.toDouble() else 0.0))
        }
        return o.toString()
    }

    @Synchronized
    fun addPending(event: JSONObject) {
        // Only the latest for a video (its last position), every chapter for manga.
        if (event.optString("type") == "video") pending.removeAll { it.optString("type") == "video" && it.optString("itemId") == event.optString("itemId") }
        pending.add(event)
        save()
    }

    @Synchronized
    fun takePending(): List<JSONObject> = ArrayList(pending)

    @Synchronized
    fun donePending(event: JSONObject) {
        pending.remove(event)
        save()
    }

    // ---------- file names ----------

    private fun safe(s: String) = s.replace(Regex("""[\\/:*?"<>|\u0000-\u001f]"""), "_").trim().trimEnd('.').ifEmpty { "_" }.take(120)

    /** Manga the way Mihon's Local source reads it: Manga/<Series>/<Series> - Ch. 012.5.cbz. Videos get their extension once the download says what they are. */
    fun pathFor(item: JSONObject): String {
        val group = safe(item.optString("group"))
        return if (item.optString("kind") == "manga") {
            val n = item.optDouble("chapter")
            val whole = n.toLong().toString().padStart(3, '0')
            val frac = if (n % 1.0 != 0.0) "." + n.toBigDecimal().stripTrailingZeros().toPlainString().substringAfter('.') else ""
            "Manga/$group/$group - Ch. $whole$frac.cbz"
        } else {
            "Videos/$group/${safe(item.optString("title"))}"
        }
    }

    fun posterPath(group: String) = "Posters/${safe(group)}.jpg"

    // ---------- reading CBZs ----------

    private var zipFor: Pair<String, ZipFile>? = null

    /** A chapter's pages, in reading order (natural sort: 2 before 10). */
    @Synchronized
    fun pages(key: String): Pair<ZipFile, List<String>>? {
        val item = items[key] ?: return null
        val path = item.getString("file")
        val zip = zipFor?.takeIf { it.first == path }?.second ?: run {
            zipFor?.second?.close()
            // A picked folder has no plain file to open: copy the chapter to the cache first (a few MB).
            val file = store.file(path) ?: File(appContext.cacheDir, "chapter.cbz").also { tmp ->
                store.input(path)?.use { inp -> tmp.outputStream().use { inp.copyTo(it) } } ?: return null
            }
            ZipFile(file).also { zipFor = path to it }
        }
        val names = zip.entries().asSequence().map { it.name }
            .filter { !it.endsWith("/") && Regex("""\.(jpe?g|png|webp|gif|avif)$""", RegexOption.IGNORE_CASE).containsMatchIn(it) }
            .sortedWith(::natural).toList()
        return zip to names
    }

    private fun natural(a: String, b: String): Int {
        val re = Regex("""\d+|\D+""")
        val x = re.findAll(a).map { it.value }.toList()
        val y = re.findAll(b).map { it.value }.toList()
        for (i in 0 until minOf(x.size, y.size)) {
            val c = if (x[i][0].isDigit() && y[i][0].isDigit()) x[i].toBigInteger().compareTo(y[i].toBigInteger()) else x[i].compareTo(y[i], ignoreCase = true)
            if (c != 0) return c
        }
        return x.size - y.size
    }
}
