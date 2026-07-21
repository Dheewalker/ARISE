import { useState, useRef, useEffect } from "react";
import {
  Search, Send, Loader2, FileText, ChevronRight, Users, Pencil, Lock, LogOut,
  MessageSquare, Inbox, Shield, Trash2, Plus, X, Eye, Rocket, Crown, LogIn,
} from "lucide-react";
import { supabase } from "./supabaseClient";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "programme", label: "Programme" },
  { id: "curriculum", label: "Curriculum" },
];

const inputStyle = {
  background: "rgba(234,228,214,0.06)", border: "1px solid rgba(234,228,214,0.15)",
  borderRadius: "6px", padding: "9px 11px", color: "#EAE4D6", fontSize: "13px",
  fontFamily: "'IBM Plex Sans', sans-serif", outline: "none", width: "100%",
};
const buttonPrimary = {
  padding: "9px 14px", borderRadius: "6px", border: "1px solid rgba(217,140,61,0.5)",
  background: "#D98C3D", color: "#16283A", fontWeight: 600, fontSize: "12.5px", cursor: "pointer",
};
const buttonGhost = {
  padding: "9px 12px", borderRadius: "6px", border: "1px solid rgba(234,228,214,0.15)",
  background: "transparent", color: "rgba(234,228,214,0.7)", fontSize: "12.5px", cursor: "pointer",
};

function buildSystemPrompt(sheets) {
  return `You are the guide embedded in the ARISE programme's knowledge base. Answer ONLY using the reference material below — do not use outside knowledge. If the material doesn't cover the question, say so plainly and point to the closest related sheet instead of guessing.

Keep answers practical and short (3-6 sentences unless the question needs a short list). Always end with which sheet(s) the answer draws from, formatted like: "— from Sheet 06: Problem & Customer Discovery".

REFERENCE MATERIAL:
${sheets.map((m, i) => `\n[Sheet ${String(i + 1).padStart(2, "0")}: ${m.title}]\n${m.body.join(" ")}`).join("\n")}`;
}

export default function App() {
  // ---------- Auth ----------
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("signup");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authForm, setAuthForm] = useState({
    name: "", email: "", password: "", programmeDegree: "", researchArea: "", skills: "",
    tags: "", lookingFor: "", bio: "", linkedin: "", photoUrl: "", adminCode: "",
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      if (!session) { setMe(null); return; }
      const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!error) setMe(data);
    })();
  }, [session]);

  async function handleSignUp(e) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    if (!authForm.name.trim() || !authForm.email.trim() || authForm.password.length < 6) {
      setAuthError("Name, email, and a password of at least 6 characters are required.");
      return;
    }
    setAuthBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: authForm.email.trim().toLowerCase(),
        password: authForm.password,
      });
      if (error) throw error;

      if (!data.user) {
        setAuthNotice("Account created — check your email to confirm, then sign in.");
        setAuthBusy(false);
        return;
      }

      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        name: authForm.name.trim(),
        programme_degree: authForm.programmeDegree.trim(),
        research_area: authForm.researchArea.trim(),
        skills: authForm.skills.trim(),
        tags: authForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
        looking_for: authForm.lookingFor.trim(),
        bio: authForm.bio.trim(),
        linkedin: authForm.linkedin.trim(),
        photo_url: authForm.photoUrl.trim(),
      });
      if (profileError) throw profileError;

      if (authForm.adminCode.trim()) {
        await supabase.rpc("claim_admin", { input_code: authForm.adminCode.trim() });
      }

      if (!data.session) {
        setAuthNotice("Account created — check your email to confirm, then sign in.");
      } else {
        // A session already exists at this point (email confirmation is off in this
        // Supabase project). Fetch the profile directly here rather than relying on
        // the session-driven effect elsewhere — that effect can fire the moment the
        // session appears, which is before this insert above has landed, and would
        // otherwise find no profile row and get stuck on the login screen.
        const { data: freshProfile, error: fetchError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .single();
        if (!fetchError) setMe(freshProfile);
      }
    } catch (err) {
      console.error("Sign up error:", err);
      setAuthError(err?.message || "Something went wrong creating your account.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authForm.email.trim().toLowerCase(),
        password: authForm.password,
      });
      if (error) throw error;
    } catch (err) {
      console.error("Sign in error:", err);
      setAuthError(err?.message || "Something went wrong signing in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogOut() {
    await supabase.auth.signOut();
    setMe(null);
    setTab("curriculum");
  }

  // ---------- Curriculum sheets ----------
  const [sheets, setSheets] = useState([]);
  const [sheetsLoading, setSheetsLoading] = useState(true);

  async function loadSheets() {
    setSheetsLoading(true);
    const { data, error } = await supabase.from("curriculum_sheets").select("*").order("sort_order");
    if (!error) setSheets(data || []);
    setSheetsLoading(false);
  }

  useEffect(() => { if (me) loadSheets(); }, [me]);

  // ---------- App tabs ----------
  const [tab, setTab] = useState("curriculum");
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState([]);
  const [asking, setAsking] = useState(false);
  const scrollRef = useRef(null);

  const sheetsWithNumber = sheets.map((s, i) => ({ ...s, number: String(i + 1).padStart(2, "0") }));
  const active = sheetsWithNumber[activeIndex] || sheetsWithNumber[0];
  const filtered = sheetsWithNumber.filter((m) => {
    if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return m.title.toLowerCase().includes(q) || (m.tags || []).some((t) => t.includes(q));
  });

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [thread, asking]);

  async function askGuide(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    setThread((t) => [...t, { role: "user", text: q }]);
    setQuestion("");
    setAsking(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: buildSystemPrompt(sheets),
          messages: [{ role: "user", content: q }],
        }),
      });
      const data = await response.json();
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      setThread((t) => [...t, { role: "assistant", text: text || "No answer returned." }]);
    } catch (err) {
      setThread((t) => [...t, { role: "assistant", text: "Something went wrong reaching the guide. Try again in a moment." }]);
    } finally {
      setAsking(false);
    }
  }

  // ---------- Directory ----------
  const [directory, setDirectory] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directorySearch, setDirectorySearch] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(null);

  async function loadDirectory() {
    setDirectoryLoading(true);
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (!error) setDirectory(data || []);
    setDirectoryLoading(false);
  }

  useEffect(() => { if (tab === "directory" && me) loadDirectory(); }, [tab, me]);

  function openEditForm() {
    setProfileForm({
      programmeDegree: me.programme_degree || "",
      researchArea: me.research_area || "",
      skills: me.skills || "",
      tags: (me.tags || []).join(", "),
      lookingFor: me.looking_for || "",
      bio: me.bio || "",
      linkedin: me.linkedin || "",
      photoUrl: me.photo_url || "",
    });
    setEditingProfile(true);
  }

  async function saveProfileEdits(e) {
    e.preventDefault();
    const updates = {
      programme_degree: profileForm.programmeDegree.trim(),
      research_area: profileForm.researchArea.trim(),
      skills: profileForm.skills.trim(),
      tags: profileForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
      looking_for: profileForm.lookingFor.trim(),
      bio: profileForm.bio.trim(),
      linkedin: profileForm.linkedin.trim(),
      photo_url: profileForm.photoUrl.trim(),
    };
    const { data, error } = await supabase.from("profiles").update(updates).eq("id", me.id).select().single();
    if (!error) {
      setMe(data);
      setEditingProfile(false);
      loadDirectory();
    }
  }

  const filteredDirectory = directory.filter((p) => {
    const q = directorySearch.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.programme_degree || "").toLowerCase().includes(q) ||
      (p.research_area || "").toLowerCase().includes(q) ||
      (p.skills || "").toLowerCase().includes(q) ||
      (p.looking_for || "").toLowerCase().includes(q) ||
      (p.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });

  // ---------- Direct messaging ----------
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [activeThreadWith, setActiveThreadWith] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const threadScrollRef = useRef(null);

  async function loadConversations() {
    if (!me) return;
    setConversationsLoading(true);
    const { data, error } = await supabase
      .from("direct_messages")
      .select("*")
      .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
      .order("created_at", { ascending: false });
    if (!error) {
      const byOther = new Map();
      for (const m of data) {
        const otherId = m.sender_id === me.id ? m.recipient_id : m.sender_id;
        if (!byOther.has(otherId)) byOther.set(otherId, m);
      }
      const ids = Array.from(byOther.keys());
      const { data: profs } = await supabase.from("profiles").select("id,name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const nameMap = Object.fromEntries((profs || []).map((p) => [p.id, p.name]));
      setConversations(
        Array.from(byOther.entries()).map(([otherId, last]) => ({
          otherId, otherName: nameMap[otherId] || "Unknown", lastText: last.text, lastTs: last.created_at,
        }))
      );
    }
    setConversationsLoading(false);
  }

  useEffect(() => { if (tab === "messages" && me) loadConversations(); }, [tab, me]);
  useEffect(() => { if (threadScrollRef.current) threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight; }, [threadMessages]);

  // Realtime: live-append new DMs into the open thread, and refresh the conversation list.
  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel(`dm-inbox-${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload) => {
        const m = payload.new;
        const involvesMe = m.sender_id === me.id || m.recipient_id === me.id;
        if (!involvesMe) return;
        setActiveThreadWith((current) => {
          if (current && (m.sender_id === current.id || m.recipient_id === current.id)) {
            setThreadMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          }
          return current;
        });
        loadConversations();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function openThread(otherId, otherName) {
    setActiveThreadWith({ id: otherId, name: otherName });
    setThreadLoading(true);
    const { data, error } = await supabase
      .from("direct_messages")
      .select("*")
      .or(`and(sender_id.eq.${me.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${me.id})`)
      .order("created_at", { ascending: true });
    if (!error) setThreadMessages(data || []);
    setThreadLoading(false);
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!messageText.trim() || !activeThreadWith || sendingMessage) return;
    setSendingMessage(true);
    const { data, error } = await supabase
      .from("direct_messages")
      .insert({ sender_id: me.id, recipient_id: activeThreadWith.id, text: messageText.trim() })
      .select()
      .single();
    if (!error) {
      setThreadMessages((t) => (t.some((x) => x.id === data.id) ? t : [...t, data]));
      setMessageText("");
      loadConversations();
    }
    setSendingMessage(false);
  }

  function messageProfile(p) {
    setTab("messages");
    openThread(p.id, p.name);
  }

  // ---------- Ventures ----------
  const [ventures, setVentures] = useState([]);
  const [venturesLoading, setVenturesLoading] = useState(false);
  const [venturePathwayFilter, setVenturePathwayFilter] = useState("all");
  const [ventureSearch, setVentureSearch] = useState("");
  const [creatingVenture, setCreatingVenture] = useState(false);
  const [ventureForm, setVentureForm] = useState({ title: "", pathway: "problem", description: "", link: "" });
  const [selectedVentureId, setSelectedVentureId] = useState(null);
  const [ventureThread, setVentureThread] = useState([]);
  const [ventureThreadLoading, setVentureThreadLoading] = useState(false);
  const [ventureMessageText, setVentureMessageText] = useState("");
  const [sendingVentureMessage, setSendingVentureMessage] = useState(false);
  const ventureThreadScrollRef = useRef(null);

  async function loadVentures() {
    setVenturesLoading(true);
    const { data: vData, error } = await supabase.from("ventures").select("*").order("created_at", { ascending: false });
    if (error || !vData) { setVentures([]); setVenturesLoading(false); return; }
    const { data: members } = await supabase.from("venture_members").select("*");
    const { data: profs } = await supabase.from("profiles").select("id,name");
    const nameMap = Object.fromEntries((profs || []).map((p) => [p.id, p.name]));
    const enriched = vData.map((v) => {
      const memberIds = (members || []).filter((m) => m.venture_id === v.id).map((m) => m.member_id);
      return { ...v, memberIds, memberNames: memberIds.map((id) => nameMap[id] || "Unknown"), leadName: nameMap[v.lead_id] || "Unknown" };
    });
    setVentures(enriched);
    setVenturesLoading(false);
  }

  useEffect(() => { if (tab === "ventures" && me) loadVentures(); }, [tab, me]);

  async function createVenture(e) {
    e.preventDefault();
    if (!ventureForm.title.trim() || !ventureForm.description.trim()) return;
    const { data, error } = await supabase
      .from("ventures")
      .insert({ title: ventureForm.title.trim(), pathway: ventureForm.pathway, description: ventureForm.description.trim(), link: ventureForm.link.trim(), lead_id: me.id })
      .select()
      .single();
    if (!error) {
      await supabase.from("venture_members").insert({ venture_id: data.id, member_id: me.id });
      setCreatingVenture(false);
      setVentureForm({ title: "", pathway: "problem", description: "", link: "" });
      await loadVentures();
      setSelectedVentureId(data.id);
    }
  }

  async function joinVenture(v) {
    if ((v.memberIds || []).includes(me.id)) return;
    await supabase.from("venture_members").insert({ venture_id: v.id, member_id: me.id });
    await loadVentures();
  }

  async function leaveVenture(v) {
    if (v.lead_id === me.id) return;
    await supabase.from("venture_members").delete().eq("venture_id", v.id).eq("member_id", me.id);
    await loadVentures();
    if (selectedVentureId === v.id) setSelectedVentureId(null);
  }

  async function deleteVenture(v) {
    if (v.lead_id !== me.id) return;
    await supabase.from("ventures").delete().eq("id", v.id);
    if (selectedVentureId === v.id) setSelectedVentureId(null);
    await loadVentures();
  }

  const filteredVentures = ventures.filter((v) => {
    if (venturePathwayFilter !== "all" && v.pathway !== venturePathwayFilter) return false;
    const q = ventureSearch.trim().toLowerCase();
    if (!q) return true;
    return v.title.toLowerCase().includes(q) || v.description.toLowerCase().includes(q);
  });

  const selectedVenture = ventures.find((v) => v.id === selectedVentureId);

  useEffect(() => {
    if (!selectedVentureId) return;
    (async () => {
      setVentureThreadLoading(true);
      const { data, error } = await supabase
        .from("venture_messages")
        .select("*")
        .eq("venture_id", selectedVentureId)
        .order("created_at", { ascending: true });
      if (!error) setVentureThread(data || []);
      setVentureThreadLoading(false);
    })();

    const channel = supabase
      .channel(`venture-chat-${selectedVentureId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "venture_messages", filter: `venture_id=eq.${selectedVentureId}` },
        (payload) => {
          const m = payload.new;
          setVentureThread((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedVentureId]);

  useEffect(() => { if (ventureThreadScrollRef.current) ventureThreadScrollRef.current.scrollTop = ventureThreadScrollRef.current.scrollHeight; }, [ventureThread]);

  async function sendVentureMessage(e) {
    e.preventDefault();
    if (!ventureMessageText.trim() || !selectedVenture || sendingVentureMessage) return;
    setSendingVentureMessage(true);
    const { data, error } = await supabase
      .from("venture_messages")
      .insert({ venture_id: selectedVenture.id, sender_id: me.id, text: ventureMessageText.trim() })
      .select()
      .single();
    if (!error) {
      setVentureThread((t) => (t.some((x) => x.id === data.id) ? t : [...t, data]));
      setVentureMessageText("");
    }
    setSendingVentureMessage(false);
  }

  // ---------- Admin: curriculum manager ----------
  const emptySheetForm = { category: "curriculum", title: "", read: "5 min", tags: "", body: "" };
  const [sheetForm, setSheetForm] = useState(emptySheetForm);
  const [editingSheetId, setEditingSheetId] = useState(null);
  const [adminSection, setAdminSection] = useState("dashboard");

  // ---------- Admin: programme dashboard ----------
  const [dashboardStats, setDashboardStats] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [soloVentureList, setSoloVentureList] = useState([]);

  async function loadDashboard() {
    setDashboardLoading(true);
    try {
      const [{ data: profs }, { data: ventureRows }, { data: memberRows }] = await Promise.all([
        supabase.from("profiles").select("id, looking_for"),
        supabase.from("ventures").select("id, title, pathway"),
        supabase.from("venture_members").select("venture_id"),
      ]);
      const memberCounts = {};
      (memberRows || []).forEach((m) => { memberCounts[m.venture_id] = (memberCounts[m.venture_id] || 0) + 1; });
      const solo = (ventureRows || []).filter((v) => (memberCounts[v.id] || 0) <= 1);
      setDashboardStats({
        totalParticipants: (profs || []).length,
        withLookingFor: (profs || []).filter((p) => p.looking_for && p.looking_for.trim()).length,
        totalVentures: (ventureRows || []).length,
        problemCount: (ventureRows || []).filter((v) => v.pathway === "problem").length,
        researchCount: (ventureRows || []).filter((v) => v.pathway === "research").length,
      });
      setSoloVentureList(solo);
    } catch {
      setDashboardStats(null);
      setSoloVentureList([]);
    } finally {
      setDashboardLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "admin" && adminSection === "dashboard" && me?.is_admin) loadDashboard();
  }, [tab, adminSection, me]);

  function startNewSheet() { setSheetForm(emptySheetForm); setEditingSheetId("new"); }
  function startEditSheet(s) {
    setSheetForm({ category: s.category, title: s.title, read: s.read_time, tags: (s.tags || []).join(", "), body: (s.body || []).join("\n") });
    setEditingSheetId(s.id);
  }

  async function saveSheetForm(e) {
    e.preventDefault();
    if (!sheetForm.title.trim() || !sheetForm.body.trim()) return;
    const parsed = {
      category: sheetForm.category, title: sheetForm.title.trim(), read_time: sheetForm.read.trim() || "5 min",
      tags: sheetForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
      body: sheetForm.body.split("\n").map((p) => p.trim()).filter(Boolean),
    };
    if (editingSheetId === "new") {
      await supabase.from("curriculum_sheets").insert({ ...parsed, sort_order: sheets.length + 1 });
    } else {
      await supabase.from("curriculum_sheets").update(parsed).eq("id", editingSheetId);
    }
    setEditingSheetId(null);
    setSheetForm(emptySheetForm);
    loadSheets();
  }

  async function deleteSheet(id) {
    await supabase.from("curriculum_sheets").delete().eq("id", id);
    if (activeIndex >= sheets.length - 1) setActiveIndex(0);
    loadSheets();
  }

  // ---------- Admin: moderation ----------
  const [adminConvos, setAdminConvos] = useState([]);
  const [adminConvosLoading, setAdminConvosLoading] = useState(false);
  const [adminSelectedConvo, setAdminSelectedConvo] = useState(null);
  const [adminThread, setAdminThread] = useState([]);
  const [adminThreadLoading, setAdminThreadLoading] = useState(false);

  async function loadAdminConversations() {
    setAdminConvosLoading(true);
    const { data, error } = await supabase.from("direct_messages").select("*").order("created_at", { ascending: false });
    if (error || !data) { setAdminConvos([]); setAdminConvosLoading(false); return; }
    const { data: profs } = await supabase.from("profiles").select("id,name");
    const nameMap = Object.fromEntries((profs || []).map((p) => [p.id, p.name]));
    const byPair = new Map();
    for (const m of data) {
      const key = [m.sender_id, m.recipient_id].sort().join("__");
      if (!byPair.has(key)) byPair.set(key, { key, names: [nameMap[m.sender_id] || "Unknown", nameMap[m.recipient_id] || "Unknown"], count: 0, lastTs: m.created_at });
      byPair.get(key).count += 1;
    }
    setAdminConvos(Array.from(byPair.values()));
    setAdminConvosLoading(false);
  }

  useEffect(() => { if (tab === "admin" && adminSection === "moderation" && me?.is_admin) loadAdminConversations(); }, [tab, adminSection, me]);

  async function openAdminThread(row) {
    setAdminSelectedConvo(row);
    setAdminThreadLoading(true);
    const [idA, idB] = row.key.split("__");
    const { data, error } = await supabase
      .from("direct_messages")
      .select("*")
      .or(`and(sender_id.eq.${idA},recipient_id.eq.${idB}),and(sender_id.eq.${idB},recipient_id.eq.${idA})`)
      .order("created_at", { ascending: true });
    if (!error) setAdminThread(data || []);
    setAdminThreadLoading(false);
  }

  // ---------- Auth gate ----------
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d2233", color: "rgba(234,228,214,0.6)", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <Loader2 size={18} style={{ animation: "spin 0.9s linear infinite", marginRight: "10px" }} /> Loading…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!session || !me) {
    return (
      <div style={{ minHeight: "100vh", background: "radial-gradient(circle at 20% 10%, #16324a 0%, #0d2233 55%, #081824 100%)", fontFamily: "'IBM Plex Sans', sans-serif", color: "#EAE4D6", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
          * { box-sizing: border-box; }
        `}</style>
        <div style={{ width: "100%", maxWidth: "380px" }}>
          <div style={{ textAlign: "center", marginBottom: "22px" }}>
            <Lock size={20} color="#D98C3D" style={{ marginBottom: "8px" }} />
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "22px", fontWeight: 700 }}>ARISE</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10.5px", letterSpacing: "0.14em", color: "rgba(234,228,214,0.4)", marginTop: "4px" }}>PROGRAMME KNOWLEDGE BASE</div>
          </div>

          <div style={{ display: "flex", marginBottom: "18px", border: "1px solid rgba(234,228,214,0.15)", borderRadius: "8px", overflow: "hidden" }}>
            {["signup", "signin"].map((m) => (
              <button key={m} onClick={() => { setAuthMode(m); setAuthError(""); setAuthNotice(""); }}
                style={{ flex: 1, padding: "10px", border: "none", background: authMode === m ? "rgba(217,140,61,0.16)" : "transparent", color: authMode === m ? "#D98C3D" : "rgba(234,228,214,0.6)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                {m === "signup" ? "Create account" : "Sign in"}
              </button>
            ))}
          </div>

          {authMode === "signup" ? (
            <form onSubmit={handleSignUp} noValidate style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              <input style={inputStyle} placeholder="Full name" value={authForm.name} onChange={(e) => setAuthForm((f) => ({ ...f, name: e.target.value }))} />
              <input style={inputStyle} type="email" name="email" autoComplete="email" placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm((f) => ({ ...f, email: e.target.value }))} />
              <input style={inputStyle} type="password" name="new-password" autoComplete="new-password" placeholder="Password (6+ characters)" value={authForm.password} onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))} />
              <input style={inputStyle} placeholder="Programme / Degree (e.g. PhD Year 2, Engineering)" value={authForm.programmeDegree} onChange={(e) => setAuthForm((f) => ({ ...f, programmeDegree: e.target.value }))} />
              <input style={inputStyle} placeholder="Research area" value={authForm.researchArea} onChange={(e) => setAuthForm((f) => ({ ...f, researchArea: e.target.value }))} />
              <input style={inputStyle} placeholder="Skills & expertise" value={authForm.skills} onChange={(e) => setAuthForm((f) => ({ ...f, skills: e.target.value }))} />
              <input style={inputStyle} placeholder="Areas of interest (comma separated, e.g. Healthcare, AI, Cities)" value={authForm.tags} onChange={(e) => setAuthForm((f) => ({ ...f, tags: e.target.value }))} />
              <input style={inputStyle} placeholder="Looking for (e.g. a technical co-founder, a design partner)" value={authForm.lookingFor} onChange={(e) => setAuthForm((f) => ({ ...f, lookingFor: e.target.value }))} />
              <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} placeholder="Short bio (optional)" value={authForm.bio} onChange={(e) => setAuthForm((f) => ({ ...f, bio: e.target.value }))} />
              <input style={inputStyle} placeholder="LinkedIn (optional)" value={authForm.linkedin} onChange={(e) => setAuthForm((f) => ({ ...f, linkedin: e.target.value }))} />
              <input style={inputStyle} placeholder="Photo URL (optional)" value={authForm.photoUrl} onChange={(e) => setAuthForm((f) => ({ ...f, photoUrl: e.target.value }))} />
              <input style={inputStyle} placeholder="Admin code (only if you're programme staff)" value={authForm.adminCode} onChange={(e) => setAuthForm((f) => ({ ...f, adminCode: e.target.value }))} />
              {authError && <div style={{ fontSize: "12px", color: "#e08a6b" }}>{authError}</div>}
              {authNotice && <div style={{ fontSize: "12px", color: "#8fbf7f" }}>{authNotice}</div>}
              <button type="submit" disabled={authBusy} style={{ ...buttonPrimary, marginTop: "4px" }}>{authBusy ? "Creating…" : "Create account"}</button>
            </form>
          ) : (
            <form onSubmit={handleSignIn} noValidate style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              <input style={inputStyle} type="email" name="email" autoComplete="email" placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm((f) => ({ ...f, email: e.target.value }))} />
              <input style={inputStyle} type="password" name="current-password" autoComplete="current-password" placeholder="Password" value={authForm.password} onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))} />
              {authError && <div style={{ fontSize: "12px", color: "#e08a6b" }}>{authError}</div>}
              <button type="submit" disabled={authBusy} style={{ ...buttonPrimary, marginTop: "4px" }}>{authBusy ? "Signing in…" : "Sign in"}</button>
            </form>
          )}

          <p style={{ fontSize: "10.5px", lineHeight: 1.5, color: "rgba(234,228,214,0.35)", marginTop: "16px", textAlign: "center" }}>
            Real authentication via Supabase Auth — passwords are hashed server-side, sessions are real JWTs. Depending on your Supabase project's Auth settings, you may need to confirm your email before signing in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(circle at 20% 10%, #16324a 0%, #0d2233 55%, #081824 100%)", fontFamily: "'IBM Plex Sans', sans-serif", color: "#EAE4D6", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .bp-grid { background-image: linear-gradient(rgba(120,170,200,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(120,170,200,0.08) 1px, transparent 1px); background-size: 28px 28px; }
        ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-thumb { background: rgba(234,228,214,0.2); border-radius: 4px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <header className="bp-grid" style={{ borderBottom: "1px solid rgba(234,228,214,0.15)", padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", letterSpacing: "0.18em", color: "#D98C3D", marginBottom: "4px" }}>ARISE EXPLORE 2026 — KNOWLEDGE BASE</div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "24px", fontWeight: 700, margin: 0 }}>ARISE</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            {[
              { id: "curriculum", label: "Curriculum", icon: FileText },
              { id: "ventures", label: "Ventures", icon: Rocket },
              { id: "directory", label: "Directory", icon: Users },
              { id: "messages", label: "Messages", icon: Inbox },
              ...(me.is_admin ? [{ id: "admin", label: "Admin", icon: Shield }] : []),
            ].map((t) => {
              const Icon = t.icon; const isActive = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "6px", border: isActive ? "1px solid rgba(217,140,61,0.5)" : "1px solid rgba(234,228,214,0.15)", background: isActive ? "rgba(217,140,61,0.16)" : "transparent", color: "#EAE4D6", fontSize: "12.5px", cursor: "pointer" }}>
                  <Icon size={14} color={isActive ? "#D98C3D" : "rgba(234,228,214,0.6)"} /> {t.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "rgba(234,228,214,0.6)" }}>
            <span>{me.name}{me.is_admin && <span style={{ color: "#D98C3D" }}> · admin</span>}</span>
            <button onClick={handleLogOut} title="Log out" style={{ display: "flex", alignItems: "center", background: "transparent", border: "none", color: "rgba(234,228,214,0.5)", cursor: "pointer", padding: "4px" }}><LogOut size={15} /></button>
          </div>
        </div>
      </header>

      {tab === "curriculum" && (
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", maxWidth: "1180px", margin: "0 auto", width: "100%" }}>
          <aside style={{ width: "280px", minWidth: "240px", padding: "24px 16px", borderRight: "1px solid rgba(234,228,214,0.12)" }}>
            <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
              {CATEGORIES.map((c) => {
                const isActive = categoryFilter === c.id;
                return <button key={c.id} onClick={() => setCategoryFilter(c.id)} style={{ fontSize: "11px", fontFamily: "'IBM Plex Mono', monospace", padding: "5px 10px", borderRadius: "20px", border: isActive ? "1px solid rgba(217,140,61,0.5)" : "1px solid rgba(234,228,214,0.15)", background: isActive ? "rgba(217,140,61,0.16)" : "transparent", color: isActive ? "#D98C3D" : "rgba(234,228,214,0.55)", cursor: "pointer" }}>{c.label}</button>;
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(234,228,214,0.06)", border: "1px solid rgba(234,228,214,0.15)", borderRadius: "6px", padding: "8px 10px", marginBottom: "18px" }}>
              <Search size={15} color="rgba(234,228,214,0.5)" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter sheets" style={{ background: "transparent", border: "none", outline: "none", color: "#EAE4D6", fontSize: "13px", width: "100%" }} />
            </div>
            {sheetsLoading ? <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>Loading…</div> : (
              <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {filtered.map((m) => {
                  const isActive = sheets[activeIndex]?.id === m.id;
                  return (
                    <button key={m.id} onClick={() => setActiveIndex(sheets.findIndex((s) => s.id === m.id))} style={{ display: "flex", alignItems: "center", gap: "10px", textAlign: "left", padding: "10px 10px", borderRadius: "6px", border: isActive ? "1px solid rgba(217,140,61,0.4)" : "1px solid transparent", background: isActive ? "rgba(217,140,61,0.14)" : "transparent", cursor: "pointer", color: "#EAE4D6" }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: isActive ? "#D98C3D" : "rgba(234,228,214,0.4)", minWidth: "20px" }}>{m.number}</span>
                      <span style={{ fontSize: "13.5px", lineHeight: 1.3 }}>{m.title}</span>
                    </button>
                  );
                })}
              </nav>
            )}
          </aside>
          <main style={{ flex: 1, minWidth: "320px", padding: "24px 28px" }}>
            {active && (
              <div className="bp-grid" style={{ background: "#F3EFE4", color: "#16283A", borderRadius: "10px", padding: "26px 28px", marginBottom: "22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(22,40,58,0.15)", paddingBottom: "12px", marginBottom: "16px", fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "rgba(22,40,58,0.55)" }}>
                  <span>SHEET {active.number}</span><span>{active.read_time} READ</span>
                </div>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "23px", fontWeight: 700, margin: "0 0 14px" }}>{active.title}</h2>
                {(active.body || []).map((p, i) => <p key={i} style={{ fontSize: "14.5px", lineHeight: 1.65, margin: "0 0 12px" }}>{p}</p>)}
              </div>
            )}
            <div style={{ border: "1px solid rgba(234,228,214,0.15)", borderRadius: "10px", background: "rgba(234,228,214,0.04)", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(234,228,214,0.12)", display: "flex", alignItems: "center", gap: "8px", fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#D98C3D" }}><FileText size={13} /> ASK THE GUIDE</div>
              {thread.length > 0 && (
                <div ref={scrollRef} style={{ maxHeight: "260px", overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {thread.map((m, i) => <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", background: m.role === "user" ? "rgba(217,140,61,0.16)" : "rgba(234,228,214,0.07)", borderRadius: "8px", padding: "10px 13px", fontSize: "13.5px", whiteSpace: "pre-wrap" }}>{m.text}</div>)}
                  {asking && <div style={{ fontSize: "13px", color: "rgba(234,228,214,0.5)", display: "flex", alignItems: "center", gap: "8px" }}><Loader2 size={14} style={{ animation: "spin 0.9s linear infinite" }} /> Searching…</div>}
                </div>
              )}
              <form onSubmit={askGuide} style={{ display: "flex", gap: "10px", padding: "14px 16px" }}>
                <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. how do I run a user interview?" style={{ flex: 1, background: "rgba(234,228,214,0.06)", border: "1px solid rgba(234,228,214,0.15)", borderRadius: "6px", padding: "10px 12px", color: "#EAE4D6", fontSize: "13.5px" }} />
                <button type="submit" disabled={asking || !question.trim()} style={{ padding: "0 16px", borderRadius: "6px", border: "1px solid rgba(217,140,61,0.5)", background: "#D98C3D", color: "#16283A", cursor: "pointer" }}><Send size={14} /></button>
              </form>
            </div>
          </main>
        </div>
      )}

      {tab === "ventures" && (
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", maxWidth: "1180px", margin: "0 auto", width: "100%" }}>
          <aside style={{ width: "300px", minWidth: "260px", padding: "24px 16px", borderRight: "1px solid rgba(234,228,214,0.12)" }}>
            <button onClick={() => { setCreatingVenture(true); setSelectedVentureId(null); }} style={{ ...buttonPrimary, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "16px" }}><Plus size={14} /> Start a venture</button>
            <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
              {[{ id: "all", label: "All" }, { id: "problem", label: "Problem-Driven" }, { id: "research", label: "Research/IP-Driven" }].map((c) => (
                <button key={c.id} onClick={() => setVenturePathwayFilter(c.id)} style={{ fontSize: "11px", padding: "5px 10px", borderRadius: "20px", border: venturePathwayFilter === c.id ? "1px solid rgba(217,140,61,0.5)" : "1px solid rgba(234,228,214,0.15)", background: venturePathwayFilter === c.id ? "rgba(217,140,61,0.16)" : "transparent", color: venturePathwayFilter === c.id ? "#D98C3D" : "rgba(234,228,214,0.55)", cursor: "pointer" }}>{c.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(234,228,214,0.06)", border: "1px solid rgba(234,228,214,0.15)", borderRadius: "6px", padding: "8px 10px", marginBottom: "18px" }}>
              <Search size={15} color="rgba(234,228,214,0.5)" />
              <input value={ventureSearch} onChange={(e) => setVentureSearch(e.target.value)} placeholder="Search ventures" style={{ background: "transparent", border: "none", outline: "none", color: "#EAE4D6", fontSize: "13px", width: "100%" }} />
            </div>
            {venturesLoading ? <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>Loading…</div> : filteredVentures.length === 0 ? <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>No ventures yet.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {filteredVentures.map((v) => {
                  const isMember = (v.memberIds || []).includes(me.id);
                  return (
                    <div
                      key={v.id}
                      onClick={() => { setSelectedVentureId(v.id); setCreatingVenture(false); }}
                      style={{ textAlign: "left", padding: "10px", borderRadius: "8px", border: selectedVentureId === v.id ? "1px solid rgba(217,140,61,0.4)" : "1px solid rgba(234,228,214,0.12)", background: selectedVentureId === v.id ? "rgba(217,140,61,0.14)" : "rgba(234,228,214,0.05)", cursor: "pointer", color: "#EAE4D6" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{v.title}</div>
                          <div style={{ fontSize: "11px", color: "rgba(234,228,214,0.5)" }}>{v.pathway === "problem" ? "Problem-Driven" : "Research/IP-Driven"} · {(v.memberIds || []).length} member{(v.memberIds || []).length === 1 ? "" : "s"}</div>
                        </div>
                        {!isMember && (
                          <button
                            onClick={(e) => { e.stopPropagation(); joinVenture(v); }}
                            style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#16283A", background: "#D98C3D", border: "none", borderRadius: "6px", padding: "5px 9px", cursor: "pointer", fontWeight: 600 }}
                          >
                            <LogIn size={11} /> Join
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
          <main style={{ flex: 1, minWidth: "320px", padding: "24px 28px" }}>
            {creatingVenture ? (
              <form onSubmit={createVenture} style={{ background: "rgba(234,228,214,0.06)", border: "1px solid rgba(217,140,61,0.3)", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "10px", maxWidth: "480px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ fontSize: "14px", fontWeight: 600, color: "#D98C3D" }}>Start a venture</div><button type="button" onClick={() => setCreatingVenture(false)} style={{ background: "transparent", border: "none", color: "rgba(234,228,214,0.5)", cursor: "pointer" }}><X size={16} /></button></div>
                <input style={inputStyle} placeholder="Venture title" value={ventureForm.title} onChange={(e) => setVentureForm((f) => ({ ...f, title: e.target.value }))} />
                <select value={ventureForm.pathway} onChange={(e) => setVentureForm((f) => ({ ...f, pathway: e.target.value }))} style={inputStyle}><option value="problem">Problem-Driven</option><option value="research">Research/IP-Driven</option></select>
                <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} placeholder="What problem or technology is this venture built around?" value={ventureForm.description} onChange={(e) => setVentureForm((f) => ({ ...f, description: e.target.value }))} />
                <input style={inputStyle} placeholder="Optional link to a sector track or IP disclosure" value={ventureForm.link} onChange={(e) => setVentureForm((f) => ({ ...f, link: e.target.value }))} />
                <button type="submit" style={buttonPrimary}>Create venture</button>
              </form>
            ) : selectedVenture ? (
              <div>
                <div className="bp-grid" style={{ background: "#F3EFE4", color: "#16283A", borderRadius: "10px", padding: "22px 26px", marginBottom: "18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                    <div><h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "20px", fontWeight: 700, margin: "0 0 4px" }}>{selectedVenture.title}</h2><div style={{ fontSize: "11.5px", fontFamily: "'IBM Plex Mono', monospace", color: "rgba(22,40,58,0.55)" }}>{selectedVenture.pathway === "problem" ? "PROBLEM-DRIVEN" : "RESEARCH/IP-DRIVEN"}</div></div>
                    {selectedVenture.lead_id === me.id ? <button onClick={() => deleteVenture(selectedVenture)} style={{ fontSize: "11.5px", color: "#a33", background: "transparent", border: "1px solid rgba(163,51,51,0.3)", borderRadius: "6px", padding: "6px 10px", cursor: "pointer" }}>Delete venture</button>
                      : (selectedVenture.memberIds || []).includes(me.id) ? <button onClick={() => leaveVenture(selectedVenture)} style={{ fontSize: "11.5px", color: "rgba(22,40,58,0.6)", background: "transparent", border: "1px solid rgba(22,40,58,0.2)", borderRadius: "6px", padding: "6px 10px", cursor: "pointer" }}>Leave venture</button>
                      : <button onClick={() => joinVenture(selectedVenture)} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#16283A", background: "#D98C3D", border: "none", borderRadius: "6px", padding: "7px 12px", cursor: "pointer", fontWeight: 600 }}><LogIn size={13} /> Join team</button>}
                  </div>
                  <p style={{ fontSize: "13.5px", lineHeight: 1.6, margin: "12px 0" }}>{selectedVenture.description}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
                    <span style={{ fontSize: "11px", background: "rgba(217,140,61,0.18)", color: "#8a5a1f", padding: "3px 10px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "4px" }}><Crown size={10} /> {selectedVenture.leadName} (lead)</span>
                    {selectedVenture.memberNames.filter((n, i) => selectedVenture.memberIds[i] !== selectedVenture.lead_id).map((n, i) => <span key={i} style={{ fontSize: "11px", background: "rgba(22,40,58,0.08)", padding: "3px 10px", borderRadius: "20px" }}>{n}</span>)}
                  </div>
                </div>
                {(selectedVenture.memberIds || []).includes(me.id) ? (
                  <div style={{ border: "1px solid rgba(234,228,214,0.15)", borderRadius: "10px", background: "rgba(234,228,214,0.04)", overflow: "hidden" }}>
                    <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(234,228,214,0.12)", fontSize: "11px", color: "#D98C3D" }}>TEAM CHAT</div>
                    <div ref={ventureThreadScrollRef} style={{ maxHeight: "300px", minHeight: "160px", overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      {ventureThreadLoading ? <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>Loading…</div> : ventureThread.length === 0 ? <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>No messages yet.</div> : ventureThread.map((m, i) => {
                        const idx = selectedVenture.memberIds.indexOf(m.sender_id);
                        const authorName = idx >= 0 ? selectedVenture.memberNames[idx] : "Unknown";
                        return <div key={i} style={{ fontSize: "13px" }}><span style={{ color: "#D98C3D", fontWeight: 600 }}>{authorName}: </span><span style={{ color: "rgba(234,228,214,0.85)" }}>{m.text}</span></div>;
                      })}
                    </div>
                    <form onSubmit={sendVentureMessage} style={{ display: "flex", gap: "10px", padding: "14px 16px", borderTop: "1px solid rgba(234,228,214,0.1)" }}>
                      <input value={ventureMessageText} onChange={(e) => setVentureMessageText(e.target.value)} placeholder="Message the team…" style={{ flex: 1, background: "rgba(234,228,214,0.06)", border: "1px solid rgba(234,228,214,0.15)", borderRadius: "6px", padding: "10px 12px", color: "#EAE4D6", fontSize: "13.5px" }} />
                      <button type="submit" disabled={!ventureMessageText.trim() || sendingVentureMessage} style={{ padding: "0 16px", borderRadius: "6px", border: "1px solid rgba(217,140,61,0.5)", background: "#D98C3D", color: "#16283A", cursor: "pointer" }}><Send size={14} /></button>
                    </form>
                  </div>
                ) : <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>Join this venture's team to see the team chat.</div>}
              </div>
            ) : <div style={{ fontSize: "13px", color: "rgba(234,228,214,0.45)" }}>Select a venture, or start a new one.</div>}
          </main>
        </div>
      )}

      {tab === "directory" && (
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", maxWidth: "1180px", margin: "0 auto", width: "100%" }}>
          <aside style={{ width: "280px", minWidth: "240px", padding: "24px 16px", borderRight: "1px solid rgba(234,228,214,0.12)" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "rgba(234,228,214,0.4)", marginBottom: "10px" }}>YOUR PROFILE</div>
            {editingProfile ? (
              <form onSubmit={saveProfileEdits} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <input style={inputStyle} placeholder="Programme / Degree" value={profileForm.programmeDegree} onChange={(e) => setProfileForm((f) => ({ ...f, programmeDegree: e.target.value }))} />
                <input style={inputStyle} placeholder="Research area" value={profileForm.researchArea} onChange={(e) => setProfileForm((f) => ({ ...f, researchArea: e.target.value }))} />
                <input style={inputStyle} placeholder="Skills & expertise" value={profileForm.skills} onChange={(e) => setProfileForm((f) => ({ ...f, skills: e.target.value }))} />
                <input style={inputStyle} placeholder="Areas of interest (comma separated)" value={profileForm.tags} onChange={(e) => setProfileForm((f) => ({ ...f, tags: e.target.value }))} />
                <input style={inputStyle} placeholder="Looking for" value={profileForm.lookingFor} onChange={(e) => setProfileForm((f) => ({ ...f, lookingFor: e.target.value }))} />
                <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} placeholder="Short bio" value={profileForm.bio} onChange={(e) => setProfileForm((f) => ({ ...f, bio: e.target.value }))} />
                <input style={inputStyle} placeholder="LinkedIn" value={profileForm.linkedin} onChange={(e) => setProfileForm((f) => ({ ...f, linkedin: e.target.value }))} />
                <input style={inputStyle} placeholder="Photo URL" value={profileForm.photoUrl} onChange={(e) => setProfileForm((f) => ({ ...f, photoUrl: e.target.value }))} />
                <div style={{ display: "flex", gap: "8px" }}><button type="submit" style={{ ...buttonPrimary, flex: 1 }}>Save</button><button type="button" onClick={() => setEditingProfile(false)} style={buttonGhost}>Cancel</button></div>
              </form>
            ) : (
              <div style={{ background: "rgba(234,228,214,0.06)", border: "1px solid rgba(234,228,214,0.15)", borderRadius: "8px", padding: "14px" }}>
                {me.photo_url && (
                  <img src={me.photo_url} alt="" style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover", marginBottom: "8px" }} onError={(e) => { e.target.style.display = "none"; }} />
                )}
                <div style={{ fontWeight: 600, fontSize: "14px" }}>{me.name}</div>
                <div style={{ fontSize: "12px", color: "rgba(234,228,214,0.55)", marginBottom: "6px" }}>{me.programme_degree}</div>
                {me.research_area && <div style={{ fontSize: "11.5px", color: "rgba(234,228,214,0.5)", marginBottom: "6px" }}>Research: {me.research_area}</div>}
                {me.looking_for && <div style={{ fontSize: "11.5px", color: "#D98C3D", marginBottom: "6px" }}>Looking for: {me.looking_for}</div>}
                {me.bio && <p style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.75)" }}>{me.bio}</p>}
                {me.linkedin && <a href={me.linkedin} target="_blank" rel="noreferrer" style={{ fontSize: "11.5px", color: "#D98C3D", display: "block", marginBottom: "8px" }}>LinkedIn ↗</a>}
                <button onClick={openEditForm} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#D98C3D", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}><Pencil size={12} /> Edit profile</button>
              </div>
            )}
          </aside>
          <main style={{ flex: 1, minWidth: "320px", padding: "24px 28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(234,228,214,0.06)", border: "1px solid rgba(234,228,214,0.15)", borderRadius: "6px", padding: "8px 10px", marginBottom: "18px", maxWidth: "360px" }}>
              <Search size={15} color="rgba(234,228,214,0.5)" />
              <input value={directorySearch} onChange={(e) => setDirectorySearch(e.target.value)} placeholder="Search by name, research area, skills, or interest" style={{ background: "transparent", border: "none", outline: "none", color: "#EAE4D6", fontSize: "13px", width: "100%" }} />
            </div>
            {directoryLoading ? <div style={{ fontSize: "13px", color: "rgba(234,228,214,0.5)" }}>Loading…</div> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                {filteredDirectory.map((p) => {
                  const isMe = p.id === me.id;
                  return (
                    <div key={p.id} style={{ background: "rgba(234,228,214,0.06)", border: "1px solid rgba(234,228,214,0.15)", borderRadius: "8px", padding: "14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        {p.photo_url && (
                          <img src={p.photo_url} alt="" style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />
                        )}
                        <div style={{ fontWeight: 600, fontSize: "14px" }}>{p.name} {isMe && <span style={{ fontSize: "10px", color: "#D98C3D" }}>(you)</span>}</div>
                      </div>
                      <div style={{ fontSize: "11.5px", color: "rgba(234,228,214,0.55)", marginBottom: "6px" }}>
                        {p.programme_degree}{p.research_area && ` · ${p.research_area}`}
                      </div>
                      {p.skills && <div style={{ fontSize: "11px", color: "rgba(234,228,214,0.45)", marginBottom: "6px" }}>Skills: {p.skills}</div>}
                      {p.looking_for && <div style={{ fontSize: "11px", color: "#D98C3D", marginBottom: "8px" }}>Looking for: {p.looking_for}</div>}
                      {p.tags?.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "10px" }}>
                          {p.tags.slice(0, 4).map((t) => (
                            <span key={t} style={{ fontSize: "10.5px", background: "rgba(217,140,61,0.15)", color: "#D98C3D", padding: "2px 8px", borderRadius: "20px" }}>{t}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {!isMe && (
                          <button onClick={() => messageProfile(p)} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#D98C3D", background: "transparent", border: "1px solid rgba(217,140,61,0.35)", borderRadius: "6px", padding: "6px 10px", cursor: "pointer" }}><MessageSquare size={12} /> Message</button>
                        )}
                        {p.linkedin && <a href={p.linkedin} target="_blank" rel="noreferrer" style={{ fontSize: "11.5px", color: "rgba(234,228,214,0.5)" }}>LinkedIn ↗</a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      )}

      {tab === "messages" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: "1180px", margin: "0 auto", width: "100%" }}>
          <div style={{ margin: "18px 28px 0", padding: "10px 14px", background: "rgba(217,140,61,0.1)", border: "1px solid rgba(217,140,61,0.25)", borderRadius: "8px", fontSize: "11.5px", color: "rgba(234,228,214,0.7)", display: "flex", alignItems: "center", gap: "8px" }}><Eye size={13} color="#D98C3D" /> Programme admins can review messages here for safety and support purposes.</div>
          <div style={{ flex: 1, display: "flex", flexWrap: "wrap", width: "100%" }}>
            <aside style={{ width: "280px", minWidth: "240px", padding: "18px 16px 24px", borderRight: "1px solid rgba(234,228,214,0.12)" }}>
              {conversationsLoading ? <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>Loading…</div> : conversations.length === 0 ? <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>No conversations yet.</div> : conversations.map((c) => (
                <button key={c.otherId} onClick={() => openThread(c.otherId, c.otherName)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px", borderRadius: "6px", border: activeThreadWith?.id === c.otherId ? "1px solid rgba(217,140,61,0.4)" : "1px solid transparent", background: activeThreadWith?.id === c.otherId ? "rgba(217,140,61,0.14)" : "transparent", cursor: "pointer", color: "#EAE4D6" }}>
                  <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{c.otherName}</div>
                  <div style={{ fontSize: "11.5px", color: "rgba(234,228,214,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.lastText}</div>
                </button>
              ))}
            </aside>
            <main style={{ flex: 1, minWidth: "320px", padding: "18px 28px 24px", display: "flex", flexDirection: "column" }}>
              {!activeThreadWith ? <div style={{ fontSize: "13px", color: "rgba(234,228,214,0.45)" }}>Select a conversation, or message someone from the Directory.</div> : (
                <div style={{ border: "1px solid rgba(234,228,214,0.15)", borderRadius: "10px", background: "rgba(234,228,214,0.04)", display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                  <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(234,228,214,0.12)", fontSize: "13.5px", fontWeight: 600 }}>{activeThreadWith.name}</div>
                  <div ref={threadScrollRef} style={{ flex: 1, minHeight: "260px", maxHeight: "420px", overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    {threadLoading ? <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>Loading…</div> : threadMessages.map((m, i) => (
                      <div key={i} style={{ alignSelf: m.sender_id === me.id ? "flex-end" : "flex-start", maxWidth: "75%", background: m.sender_id === me.id ? "rgba(217,140,61,0.16)" : "rgba(234,228,214,0.07)", borderRadius: "8px", padding: "9px 12px", fontSize: "13.5px" }}>{m.text}</div>
                    ))}
                  </div>
                  <form onSubmit={sendMessage} style={{ display: "flex", gap: "10px", padding: "14px 16px", borderTop: "1px solid rgba(234,228,214,0.1)" }}>
                    <input value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Write a message…" style={{ flex: 1, background: "rgba(234,228,214,0.06)", border: "1px solid rgba(234,228,214,0.15)", borderRadius: "6px", padding: "10px 12px", color: "#EAE4D6", fontSize: "13.5px" }} />
                    <button type="submit" disabled={!messageText.trim() || sendingMessage} style={{ padding: "0 16px", borderRadius: "6px", border: "1px solid rgba(217,140,61,0.5)", background: "#D98C3D", color: "#16283A", cursor: "pointer" }}><Send size={14} /></button>
                  </form>
                </div>
              )}
            </main>
          </div>
        </div>
      )}

      {tab === "admin" && me.is_admin && (
        <div style={{ flex: 1, maxWidth: "1180px", margin: "0 auto", width: "100%", padding: "24px 28px" }}>
          <div style={{ display: "flex", gap: "6px", marginBottom: "22px" }}>
            {[{ id: "dashboard", label: "Programme Dashboard" }, { id: "curriculum", label: "Curriculum Manager" }, { id: "moderation", label: "Conversations Overview" }].map((s) => (
              <button key={s.id} onClick={() => setAdminSection(s.id)} style={{ fontSize: "12.5px", padding: "8px 14px", borderRadius: "6px", border: adminSection === s.id ? "1px solid rgba(217,140,61,0.5)" : "1px solid rgba(234,228,214,0.15)", background: adminSection === s.id ? "rgba(217,140,61,0.16)" : "transparent", color: adminSection === s.id ? "#D98C3D" : "rgba(234,228,214,0.6)", cursor: "pointer" }}>{s.label}</button>
            ))}
          </div>

          {adminSection === "dashboard" && (
            <div>
              {dashboardLoading ? (
                <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>Loading…</div>
              ) : !dashboardStats ? (
                <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>Couldn't load dashboard data.</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "26px" }}>
                    {[
                      { label: "Participants", value: dashboardStats.totalParticipants },
                      { label: "Profiles with \"Looking For\" filled", value: `${dashboardStats.withLookingFor} / ${dashboardStats.totalParticipants}` },
                      { label: "Ventures formed", value: dashboardStats.totalVentures },
                      { label: "Problem-Driven ventures", value: dashboardStats.problemCount },
                      { label: "Research/IP-Driven ventures", value: dashboardStats.researchCount },
                      { label: "Ventures still solo", value: soloVentureList.length },
                    ].map((s) => (
                      <div key={s.label} style={{ background: "rgba(234,228,214,0.05)", border: "1px solid rgba(234,228,214,0.12)", borderRadius: "10px", padding: "16px" }}>
                        <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: "#D98C3D" }}>{s.value}</div>
                        <div style={{ fontSize: "11.5px", color: "rgba(234,228,214,0.55)", marginTop: "4px" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px", color: "#D98C3D" }}>
                    Ventures still solo (lead only, no teammates yet)
                  </div>
                  {soloVentureList.length === 0 ? (
                    <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>
                      None — every venture has at least one teammate beyond the lead.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {soloVentureList.map((v) => (
                        <div key={v.id} style={{ display: "flex", justifyContent: "space-between", background: "rgba(234,228,214,0.05)", border: "1px solid rgba(234,228,214,0.12)", borderRadius: "8px", padding: "10px 14px", fontSize: "13px" }}>
                          <span>{v.title}</span>
                          <span style={{ color: "rgba(234,228,214,0.5)", fontSize: "11.5px" }}>{v.pathway === "problem" ? "Problem-Driven" : "Research/IP-Driven"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p style={{ fontSize: "11px", color: "rgba(234,228,214,0.35)", marginTop: "14px" }}>
                    Useful for steering participants toward joining an existing venture rather than starting another solo one — a direct nudge point for facilitators during Idea Pitch and Venture Recruitment.
                  </p>
                </>
              )}
            </div>
          )}

          {adminSection === "curriculum" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ fontSize: "13px", color: "rgba(234,228,214,0.6)" }}>{sheets.length} sheets</div>
                <button onClick={startNewSheet} style={{ ...buttonPrimary, display: "flex", alignItems: "center", gap: "6px" }}><Plus size={14} /> New sheet</button>
              </div>
              {editingSheetId && (
                <form onSubmit={saveSheetForm} style={{ background: "rgba(234,228,214,0.06)", border: "1px solid rgba(217,140,61,0.3)", borderRadius: "8px", padding: "16px", marginBottom: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <select value={sheetForm.category} onChange={(e) => setSheetForm((f) => ({ ...f, category: e.target.value }))} style={inputStyle}>
                    <option value="programme">Programme</option><option value="curriculum">Curriculum</option>
                  </select>
                  <input style={inputStyle} placeholder="Sheet title" value={sheetForm.title} onChange={(e) => setSheetForm((f) => ({ ...f, title: e.target.value }))} />
                  <input style={inputStyle} placeholder="Read time" value={sheetForm.read} onChange={(e) => setSheetForm((f) => ({ ...f, read: e.target.value }))} />
                  <input style={inputStyle} placeholder="Tags (comma separated)" value={sheetForm.tags} onChange={(e) => setSheetForm((f) => ({ ...f, tags: e.target.value }))} />
                  <textarea style={{ ...inputStyle, resize: "vertical" }} rows={6} placeholder="Body — one paragraph per line" value={sheetForm.body} onChange={(e) => setSheetForm((f) => ({ ...f, body: e.target.value }))} />
                  <button type="submit" style={buttonPrimary}>Save sheet</button>
                </form>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {sheetsWithNumber.map((s) => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", background: "rgba(234,228,214,0.05)", border: "1px solid rgba(234,228,214,0.12)", borderRadius: "8px", padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: "10px" }}><span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "rgba(234,228,214,0.4)" }}>{s.number}</span><span style={{ fontSize: "13.5px" }}>{s.title}</span></div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => startEditSheet(s)} style={{ background: "transparent", border: "none", color: "rgba(234,228,214,0.5)", cursor: "pointer" }}><Pencil size={14} /></button>
                      <button onClick={() => deleteSheet(s.id)} style={{ background: "transparent", border: "none", color: "rgba(234,228,214,0.4)", cursor: "pointer" }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {adminSection === "moderation" && (
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <div style={{ width: "320px", minWidth: "260px" }}>
                {adminConvosLoading ? <div style={{ fontSize: "12.5px", color: "rgba(234,228,214,0.4)" }}>Loading…</div> : adminConvos.map((c) => (
                  <button key={c.key} onClick={() => openAdminThread(c)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px", borderRadius: "8px", border: "1px solid rgba(234,228,214,0.12)", background: "rgba(234,228,214,0.05)", cursor: "pointer", color: "#EAE4D6", marginBottom: "6px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600 }}>{c.names[0]} ↔ {c.names[1]}</div>
                    <div style={{ fontSize: "11px", color: "rgba(234,228,214,0.5)" }}>{c.count} messages</div>
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: "280px" }}>
                {!adminSelectedConvo ? <div style={{ fontSize: "13px", color: "rgba(234,228,214,0.45)" }}>Select a conversation.</div> : (
                  <div style={{ border: "1px solid rgba(234,228,214,0.15)", borderRadius: "10px", background: "rgba(234,228,214,0.04)", padding: "16px 18px" }}>
                    {adminThreadLoading ? <div>Loading…</div> : adminThread.map((m, i) => <div key={i} style={{ fontSize: "13px", color: "rgba(234,228,214,0.85)", marginBottom: "6px" }}>{m.text}</div>)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
