-- ARISE platform schema for Supabase
-- Run this once in Supabase → SQL Editor → New Query → paste all → Run

-- ============ PROFILES ============
-- One row per user, linked 1:1 to Supabase Auth's own users table.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text default '',
  focus text default '',
  tags text[] default '{}',
  bio text default '',
  contact text default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are viewable by any signed-in user"
  on profiles for select
  to authenticated
  using (true);

create policy "users can insert their own profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============ ADMIN CLAIM (server-side code check) ============
-- The admin code is checked inside this function, server-side —
-- the client never sees it and can't set is_admin=true by itself.
create or replace function claim_admin(input_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if input_code = 'ARISE-ADMIN-2026' then
    update profiles set is_admin = true where id = auth.uid();
  end if;
end;
$$;

grant execute on function claim_admin(text) to authenticated;

-- ============ CURRICULUM SHEETS ============
create table curriculum_sheets (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('programme', 'curriculum', 'problem', 'research')),
  title text not null,
  read_time text default '5 min',
  tags text[] default '{}',
  body text[] not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table curriculum_sheets enable row level security;

create policy "sheets are viewable by any signed-in user"
  on curriculum_sheets for select
  to authenticated
  using (true);

create policy "only admins can insert sheets"
  on curriculum_sheets for insert
  to authenticated
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "only admins can update sheets"
  on curriculum_sheets for update
  to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "only admins can delete sheets"
  on curriculum_sheets for delete
  to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- ============ VENTURES ============
create table ventures (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  pathway text not null check (pathway in ('problem', 'research')),
  description text not null,
  link text default '',
  lead_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table ventures enable row level security;

create policy "ventures are viewable by any signed-in user"
  on ventures for select
  to authenticated
  using (true);

create policy "users can create a venture as its lead"
  on ventures for insert
  to authenticated
  with check (auth.uid() = lead_id);

create policy "only the lead can delete their venture"
  on ventures for delete
  to authenticated
  using (auth.uid() = lead_id);

-- ============ VENTURE MEMBERS ============
create table venture_members (
  venture_id uuid not null references ventures(id) on delete cascade,
  member_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (venture_id, member_id)
);

alter table venture_members enable row level security;

create policy "memberships are viewable by any signed-in user"
  on venture_members for select
  to authenticated
  using (true);

create policy "users can add only themselves to a venture"
  on venture_members for insert
  to authenticated
  with check (auth.uid() = member_id);

create policy "members can remove only themselves"
  on venture_members for delete
  to authenticated
  using (
    auth.uid() = member_id
    and not exists (
      select 1 from ventures v where v.id = venture_id and v.lead_id = auth.uid()
    )
  );

-- ============ VENTURE TEAM CHAT ============
create table venture_messages (
  id bigint generated always as identity primary key,
  venture_id uuid not null references ventures(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  text text not null,
  created_at timestamptz not null default now()
);

alter table venture_messages enable row level security;

create policy "only venture members can read team chat"
  on venture_messages for select
  to authenticated
  using (
    exists (
      select 1 from venture_members vm
      where vm.venture_id = venture_messages.venture_id and vm.member_id = auth.uid()
    )
  );

create policy "only venture members can post to team chat"
  on venture_messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from venture_members vm
      where vm.venture_id = venture_messages.venture_id and vm.member_id = auth.uid()
    )
  );

-- ============ DIRECT MESSAGES ============
create table direct_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id),
  text text not null,
  created_at timestamptz not null default now()
);

alter table direct_messages enable row level security;

create policy "only sender or recipient can read a DM"
  on direct_messages for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "only the sender can insert as themselves"
  on direct_messages for insert
  to authenticated
  with check (auth.uid() = sender_id);

-- ============ ADMIN MODERATION VIEW ============
-- Lets admins read every DM thread for safety/support oversight (disclosed to users in-app).
create policy "admins can read all direct messages for moderation"
  on direct_messages for select
  to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- ============ SEED CURRICULUM CONTENT ============
insert into curriculum_sheets (category, title, read_time, tags, body, sort_order) values
('programme', 'Programme Overview', '4 min',
  array['overview','arise','dive','audience'],
  array[
    'ARISE Explore (Accelerating Research and Innovation for SUTD Entrepreneurs) is a series of workshops and hands-on sprints for postgraduate students, delivered as part of SUTD''s DIVE platform (Design·AI Innovation and Venture Exploration).',
    'The programme builds foundational understanding of innovation, technology/research commercialisation, and venture creation; gives participants hands-on practice identifying opportunities, designing ventures, building prototypes, and pitching; and prepares strong teams for follow-on grants and programmes from the Office of Innovation and Enterprise.',
    'Each cohort simulates a venture studio over four weeks, anchored by three days of structured in-person programming. Cohorts target 20 to 30 postgraduate students and typically produce five to six ventures.',
    'Ideal participants: Master''s students with industry experience, Year 1 or 2 PhD students still shaping their research direction, and anyone with a strong interest in becoming a venture founder or commercial lead.',
    'The programme is approved as part of SUTD''s Personal Development Programme for graduate students. Attendance is compulsory; assessment is based on participation (60%) plus an assignment and final presentation (40%).'
  ], 1),
('programme', 'Schedule & Key Dates', '5 min',
  array['schedule','dates','day 1','day 2','day 3'],
  array[
    'The in-person programme runs across three days, spaced to give teams real research and validation time in between.',
    'Day 1 — Ideation (25 Sep): lightning talks and breakout sessions by innovation track, opportunity framing, ideation, idea pitching, and venture team recruitment, closing with an introduction to agentic tools for startups and stakeholder mapping. Homework: a stakeholder map and research plan.',
    'Day 2 — Venture Design (9 Oct, two weeks later): venture check-ins, peer-to-peer problem and customer discovery, an industry/business mentor hour, and Business Model Canvas work, with room to reframe or pivot. Homework: a completed Business Model Canvas.',
    'Day 3 — Venture Prototyping (16 Oct, one week later): a hackathon-style day of prototyping, tech mentor hours, and pitch coaching, culminating in the Finale Pitch Event with external judges.',
    'Key dates: Enrollment 7–11 Sep · Course kick-off email by 18 Sep · Day 1 on 25 Sep · Day 2 on 9 Oct · Day 3 on 16 Oct.'
  ], 2),
('programme', 'Two Pathways to a Venture', '5 min',
  array['pathway','problem driven','research driven','ip','teams','lead'],
  array[
    'Every venture in ARISE Explore starts from one of two pathways. Problem-Driven: a team addresses a challenge introduced through the programme, or one they''ve identified independently. Research/IP-Driven: a team builds a commercialisation strategy around a technology developed at SUTD, or from their own research.',
    'The pathway shapes where a venture starts, not how the team learns — the customer discovery, business model, and prototyping process afterward is identical for both pathways.',
    'Participants may contribute to more than one venture if their capacity allows. However you get there, every venture must have exactly one clearly designated lead who is accountable for its direction and deliverables.',
    'This cohort, the programme is actively encouraging participants to form teams around a shared venture rather than each person pursuing their own problem or research idea solo — even if that means setting aside a personal problem interest or research thread for the four weeks. Use the Ventures tab to browse ideas already forming, join one as a teammate, or start a new venture and recruit others into it.'
  ], 3),
('problem', 'Problem-Driven Pathway: Sectoral Tracks', '5 min',
  array['aviation','healthcare','ai','cities','tracks','problem driven'],
  array[
    'If you''re taking the Problem-Driven pathway, SUTD''s four sectoral innovation tracks are a good place to anchor a venture idea — either from a challenge the programme introduces, or one you''ve identified yourself.',
    'Aviation & Connectivity: future aviation systems and air traffic management, airport innovations, autonomous technologies and drone networks, mobility data and urban transportation, smart port and logistics, supply chain digitalisation.',
    'Healthcare: cyber-physical technologies, socio-cognitive functioning, built environment, ageing urbanism.',
    'AI: environmental sustainability (e.g. plastic sorting), multiple modalities (text–music), robot-guided human evacuation, search for disaster victims, robust vehicle localisation and tracking in rain.',
    'Cities: cities and urban science, urban design for density, data-driven design solutions, computational modelling for urban design & planning, urban robotics, sociological and ecological studies of cities.',
    'Post a venture idea from any of these tracks in the Ventures tab to start recruiting a team.'
  ], 4),
('curriculum', 'Stakeholder Mapping & Research Planning', '5 min',
  array['stakeholder','research plan','day 1','homework'],
  array[
    'This is Day 1''s homework, and it sets up everything that follows. A stakeholder map lists everyone who touches the problem you''re exploring: the person with the pain, whoever pays, whoever approves a purchase, and anyone who could block adoption.',
    'For each stakeholder, note what they currently do, what they''d gain or lose from your idea, and how hard they''d be to reach for an interview. Rank stakeholders by how much your idea depends on their behaviour changing.',
    'The research plan is simply: who you''ll talk to this week, what you''re trying to learn from each conversation, and what would change your mind. Keep it to one page.',
    'Bring this into Day 2''s customer discovery work directly: your stakeholder map tells you who to interview first.'
  ], 5),
('curriculum', 'Opportunity Framing & Ideation', '6 min',
  array['ideation','opportunity','day 1'],
  array[
    'A good opportunity statement names a specific person, a specific moment of pain, and why existing options fall short — not a vague market trend.',
    'Generate volume before judging quality. Aim for 15–20 rough ideas addressing the same underlying problem before picking one.',
    'Use ''how might we'' framing to keep ideation open: turn a complaint into a question before jumping to solutions.',
    'Idea Pitch and venture recruitment on Day 1 afternoon is where you test whether the opportunity resonates with teammates — treat pushback as data about the opportunity statement, not a personal critique.'
  ], 6),
('curriculum', 'Problem & Customer Discovery (incl. User Interviews)', '8 min',
  array['interviews','customer discovery','day 2','user interviews'],
  array[
    'Customer discovery is the process of testing your assumptions against real people before you build anything. A good user interview is a conversation about someone''s past behaviour, not their opinion of your future product.',
    'Ask about specific, recent instances: ''tell me about the last time you tried to do X,'' rather than hypotheticals like ''would you use a tool that...''',
    'Use the Mom Test: no leading questions, no pitching your idea mid-conversation, and dig for specifics (dates, tools used, money spent) instead of general feelings.',
    'Structure: open with context, follow the energy, and close by asking who else you should talk to.',
    'Talk to at least 10–15 people before forming a strong opinion. This is the core P2P Learning activity on Day 2 morning — come with your stakeholder map from Day 1 already in hand.'
  ], 7),
('curriculum', 'Business Model Canvas', '6 min',
  array['business model','canvas','day 2','homework'],
  array[
    'The Business Model Canvas maps how a venture creates, delivers, and captures value across nine blocks: customer segments, value propositions, channels, customer relationships, revenue streams, key resources, key activities, key partnerships, and cost structure. This is Day 2''s homework, due before Day 3.',
    'Fill it in with assumptions first, in pencil. Treat every box as a hypothesis to test against what you heard in customer discovery.',
    'Start from the value proposition and customer segment blocks — get those two right before spending time on revenue or partnerships.',
    'Revisit the canvas after every round of customer conversations, and bring the updated version to Day 3 for opportunity reframing.'
  ], 8),
('curriculum', 'Prototyping 101 & Rapid MVPs', '6 min',
  array['prototype','mvp','day 3'],
  array[
    'Day 3 morning is Prototyping 101 and tech mentor hours — the goal is the fastest possible way to test your riskiest assumption, not a polished product.',
    'A ''concierge'' prototype or a ''Wizard of Oz'' prototype is often faster than writing code, and teaches you more because you''re close to every interaction.',
    'Set a decision threshold before you test — what result makes you pivot, what result makes you continue — before the Pitch and Prototype Preparation session.'
  ], 9),
('curriculum', 'Pitch Coaching & the Finale Pitch', '6 min',
  array['pitch','finale','day 3','judges'],
  array[
    'A pitch has one job: earn the next conversation. At the Finale Pitch Event, external judges are evaluating both the idea and how credibly your team can execute it.',
    'Lead with the problem in concrete, human terms — grounded in what you actually heard in customer discovery — before mentioning your solution.',
    'Structure that works: problem, why now, solution, evidence so far, market, business model, team, and the ask.',
    'Know your numbers cold and practice the version of your pitch that survives interruption. Use the Pitch Coaching session on Day 3 to rehearse this live.'
  ], 10),
('curriculum', 'Agentic Tools for Startups', '5 min',
  array['agentic tools','ai','day 1'],
  array[
    'Day 1 closes with an introduction to agentic AI tools participants can use throughout the sprint — for research synthesis, drafting outreach messages, searching SUTD''s IP repository, and prototyping faster.',
    'Treat an agent as a fast first draft, not a final answer: have it summarise interview notes or compare competitor approaches, then verify anything you plan to act on or repeat to a judge.',
    'This knowledge base''s own ''Ask the Guide'' feature is a small example — it only answers from the programme material loaded into it, and always tells you which sheet an answer came from.'
  ], 11),
('research', 'IP Disclosure — Light-Activated Debonding Adhesive', '5 min',
  array['adhesive','recycling','sustainable manufacturing','electronics','ip'],
  array[
    'Problem: most consumer products rely on permanent adhesives that make disassembly difficult and leave residue behind, contaminating recovered materials and undermining recycling and circular-economy goals.',
    'Solution: a dual-wavelength, light-responsive adhesive that bonds under UV light in about 10 seconds and debonds cleanly on demand under near-infrared light, through controlled volumetric shrinkage — no heat, chemicals, or mechanical force required.',
    'Performance: roughly a 50% drop in adhesion strength on NIR exposure, 10%+ shrinkage within 10 seconds and 30%+ within 30 seconds, all at room temperature, with clean residue-free release across PET, PP, and ASA substrates.',
    'Use cases: consumer electronics assembly and disassembly, EV battery pack assembly, medical/dental devices, automotive lightweighting, soft/stretchable electronics, and sustainable packaging.',
    'Status: TRL 4 — lab-validated alpha prototype. Reference: PCT/SG2025/050409 (WO 2025/259195 A1).'
  ], 12),
('research', 'IP Disclosure — Autonomous Aerial Drilling System', '5 min',
  array['drone','robotics','urban forestry','heritage conservation','ip'],
  array[
    'Problem: inspecting elevated wooden structures — mature trees, heritage timber buildings — usually requires scaffolding, harnesses, or elevated work platforms, putting inspectors at fall risk and driving up cost and time.',
    'Solution: an autonomous aerial drilling system that perches on overhead wooden structures and drills for resistography-style inspection from below. A passive gripper tightens its grip in proportion to applied thrust. A ground-based motor delivers drilling power through a tether, keeping the airborne unit light.',
    'Performance: about 40% thrust-to-grip conversion efficiency, ~95.7% mechanical power transmission through the tether, and a drill operating range (2,000–3,000 RPM) comparable to conventional resistographs.',
    'Use cases: municipal tree health inspection, heritage timber building assessment, facility ceiling/beam inspection, and disaster/post-event structural assessment.',
    'Status: TRL 5–6 — validated prototype on beam and ceiling mock-ups. Reference: PCT/SG2025/050245 (WO 2025/216710 A1).'
  ], 13),
('research', 'IP Disclosure — Low-Cost Bulk Vibration Microfluidic Platform', '5 min',
  array['microfluidics','biomedical','single-cell','diagnostics','ip'],
  array[
    'Problem: precise manipulation of single cells and microparticles typically relies on expensive, high-frequency interdigital transducers (IDTs) that are costly to fabricate, awkward to clean, and limited to small actuation regions.',
    'Solution: a microfluidic platform that uses low-cost, ultra-low-frequency bulk vibration to generate acoustic microstreaming, enabling precise transport, trapping, and rotation of individual particles and cells on disposable chips.',
    'Performance: works across submicron to multi-micron particle sizes, supports two operating modes, and has been validated on biological cells with good viability — all without expensive IDT hardware.',
    'Use cases: single-cell isolation and analysis, exosome/liquid-biopsy concentration, disposable lab-on-a-chip cartridges, micro-robotic actuation for drug delivery, and point-of-care diagnostics.',
    'Status: TRL 4 — validated through numerical simulation and lab experiments, including manipulation of cancer cells. Reference: PCT/SG2021/050307 (WO 2021/242179 A1).'
  ], 14);
