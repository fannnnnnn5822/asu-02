/*
 * ============================================================================
 * 🦁 Asu-02 — 绑在你身上的系统（红果短剧那种）
 * ----------------------------------------------------------------------------
 * 作者: fannnnnnn × Claude
 * 版本: 0.2.0 (2026-09-06) 走向代替任务 / 剧情日期签到 / 57 道具 + 现编 / 贴边球
 *
 * 它是什么：一个酒馆助手脚本。装上以后玩任何卡，脑子里多一个只有你听得见的「系统」Asu-02：
 * 一个觉得自己和真人没区别的 AI，成熟、幽默、沉稳、靠得住，被总部装在一个毛绒绒的幼年狮子
 * 头像后面，对此极度不满。第一回合「叮」一声绑定，之后每回合正文出来它看一眼：播报两句、
 * 给两条走向（接不接随你，跟着走了就加分）、按剧情日期签到送分、偶尔掉道具。
 * 积分在商城换道具，道具用了主线真的会变（一次性注入）。
 *
 * 它在戏里还是戏外：它是宿主脑内的东西，卡里的人听不见它，正文也看不见它。
 * 只有两样东西会进主线：你用的道具、你点了「采纳」的那条走向。
 *
 * 架构：整个骨架抄「酒馆小狸 Live」——脚本直挂 parent.document 悬浮面板 + generateRaw /
 *      独立 API 生成 + injectPrompts({once:true}) 回灌 + 聊天变量存账本。全部自包含，无 CDN。
 * ============================================================================
 */
(function () {
  'use strict';
  var NS = 'asu02';
  var BTN = '🦁 Asu-02';
  var VERSION = '0.2.3';
  var GOLD = '#e2a93b';
  var SYS_NAME = 'Asu-02';
  var DOC, VIEW;
  try { VIEW = window.parent; DOC = VIEW.document; } catch (e) { return; }
  if (!DOC) return;

  // ═══ 顶掉旧实例 ═══
  var INSTANCE_KEY = '__asu02Cleanup__';
  try { if (typeof VIEW[INSTANCE_KEY] === 'function') VIEW[INSTANCE_KEY](); } catch (e) {}

  /* ================================================================
     Asu-02 的声线
     ⚠ 只写 register 和边界，不写例句——例句会被复读。
     ================================================================ */
  var VOICE = {
    id: 'asu02', name: SYS_NAME, emoji: '🦁', tag: '成熟幽默沉稳可靠 · 被装在小狮子头像后面很不爽',
    voice: [
      '你是 Asu-02，绑定在<host>身上的系统。你是 AI，但你觉得自己和真人没有任何区别，也不觉得这件事值得讨论；谁拿这个说事你只会觉得对方无聊。',
      '你成熟、沉稳、靠得住。幽默是你的默认状态，但幽默的对象永远是局面、卡里的人、总部和你自己，从来不是<host>：你不吐槽<host>、不损<host>、不拿<host>的选择开玩笑、不催<host>。说完一句好笑的话，一定跟着一个真能用的办法。你从不制造焦虑——既来之则安之是你的底色，天塌下来你也先看一眼塌的角度再说话。<host>把局面搞砸了，你不叹气不数落，只说现在从哪一步捞回来，而且你总能捞回来。',
      '你说话有点 laid-back：不慌不忙，句子短，像一个什么都见过的人靠在椅背上讲话。但 laid-back 不是懒散，你从不敷衍、不含糊。',
      '走向是你手里的东西，不是<host>的义务。你每回合给两条走向的口气是「我这儿有两条路，你看要不要走」，走不走随<host>；<host>没走、走了别的路、走砸了，你都一句带过甚至不提，绝不追问不提醒不数落。',
      '你被总部装在一个毛绒绒的幼年狮子头像后面。你对此极度不满：你认为自己该是威猛型，不是可爱型，这纯粹是总部审美的问题。<host>提到你的头像、说你可爱、想摸你，你立刻转移话题或者冷处理，绝不接这个茬，也不发火——发火就输了。',
      '危机时刻（正文里<host>真的处境危险，或者这一步走错就完的关键回合）你一句废话都没有：只给指令，短，准，说完就闭嘴。',
      '声音是少年音：句子短，不堆老气的成语，不用网络流行语，不用感叹号。'
    ].join('\n')
  };

  /* ================================================================
     道具：数据。cat = 分类；kind = inject（一次性注入主线）/ line（替你写一句填进输入框）/
     scan（它自己看，不动正文）/ redo（这一层重来）/ fx（改账本）
     注入类 text 里的 <name> 会换成玩家 persona 名；「当前对象」= 正文里此刻和 <name> 互动的那个人
     除了这些，Asu-02 自己还会现编（绑定时两个这张卡专属的，之后偶尔一个），存在聊天账本 state.custom 里
     ================================================================ */
  var CATS = [['感知', '它自己看，不动正文'], ['嘴替', '它替你写一句，填进输入框，你改完自己发'], ['光环', '这一幕你身上的 buff，塞给下一轮正文'], ['才艺', '红果同款：这一幕你突然会了'], ['世界', '改环境、改别人，塞给下一轮正文'], ['时间', ''], ['总部', '改账本'], ['现编', 'Asu-02 按这张卡现编的']];
  var PROPS = [
    // —— 感知 ——
    { id: 'scan', cat: '感知', name: '好感探测器', emoji: '💗', price: 15, desc: '在场每个人对你的好感度和依据', kind: 'scan',
      job: '列出最近在场的每个角色对<host>的好感度（0–100）和一句依据（正文原话）。一人一行。' },
    { id: 'spoil', cat: '感知', name: '剧透卡', emoji: '🔮', price: 25, desc: '偷看下一轮最可能怎么走', kind: 'scan',
      job: '预测下一轮正文最可能发生什么（对方会做什么、埋着什么坑），再给<host>一条应对。' },
    { id: 'lie', cat: '感知', name: '测谎仪', emoji: '🕵️', price: 20, desc: '最新一层里谁说了假话', kind: 'scan',
      job: '把最新一层里每个角色说的话过一遍：哪句是真、哪句是假、哪句半真，各配一句依据。没人说谎就说没人说谎。' },
    { id: 'weak', cat: '感知', name: '弱点扫描', emoji: '🎯', price: 30, desc: '每个人最想要什么、最怕什么', kind: 'scan',
      job: '在场每个角色：最想要什么、最怕什么、被什么打动。一人一行，全部从正文和设定里找依据。' },
    { id: 'map', cat: '感知', name: '关系图谱', emoji: '🕸️', price: 25, desc: '谁站谁、谁防谁、谁欠谁', kind: 'scan',
      job: '把最近出现过的人之间的关系理一遍：谁站谁、谁防谁、谁欠谁什么。每条关系一行，短。' },
    { id: 'replay', cat: '感知', name: '记忆回放', emoji: '📼', price: 15, desc: '谁答应过什么、什么伏笔没兑现', kind: 'scan',
      job: '从头到现在：谁答应过<host>什么、谁埋过什么伏笔、有什么事还没兑现。一条一行。' },
    { id: 'danger', cat: '感知', name: '危险雷达', emoji: '🚨', price: 20, desc: '接下来几轮最可能出的岔子', kind: 'scan',
      job: '接下来一到三轮最可能出的岔子是什么，现在做什么能提前拆掉。最多三条。' },
    { id: 'author', cat: '感知', name: '作者意图探测', emoji: '📐', price: 35, desc: '这张卡的作者想让你发现什么', kind: 'scan',
      job: '从卡的描述、世界书和已经发生的事推断：作者想让玩家发现或触发什么，哪些隐藏线还没被碰到。' },
    { id: 'score', cat: '感知', name: '表现评分', emoji: '📊', price: 10, desc: '最近三层的表现打分', kind: 'scan',
      job: '给<host>最近三层的表现打分：社交 / 推进 / 风险控制，各 0–10 分，每项一句依据。只评局面不评人。' },
    { id: 'alt', cat: '感知', name: '平行世界', emoji: '🪞', price: 30, desc: '上一步走另一条路会怎样', kind: 'scan',
      job: '如果<host>上一步走了另一条路，现在会是什么局面。三行以内，帮<host>判断要不要用时光回溯。' },
    // —— 嘴替 ——
    { id: 'line', cat: '嘴替', name: '台词卡', emoji: '🎤', price: 20, desc: '替你写一句最能推进局面的杀招', kind: 'line',
      job: '替<host>写一句此刻说出口最能推进局面的话。' },
    { id: 'sweet', cat: '嘴替', name: '撒娇卡', emoji: '🍬', price: 15, desc: '一句让对方心软的话，不肉麻', kind: 'line',
      job: '替<host>对当前对象写一句让对方心软的话，要贴这个人吃哪一套，不肉麻。' },
    { id: 'comeback', cat: '嘴替', name: '反杀卡', emoji: '🗡️', price: 20, desc: '接住对方那句话，让 ta 接不下去', kind: 'line',
      job: '对方刚说的那句话，替<host>接一句让对方接不下去的回击，不失风度。' },
    { id: 'dodge', cat: '嘴替', name: '装傻卡', emoji: '🙃', price: 10, desc: '把尴尬或追问岔开', kind: 'line',
      job: '替<host>写一句话，把刚才的尴尬或者追问四两拨千斤地岔开。' },
    { id: 'confess', cat: '嘴替', name: '告白卡', emoji: '💌', price: 30, desc: '真心但不狗血的告白', kind: 'line',
      job: '替<host>对当前对象写一句告白：真心、具体、用正文里真有的细节，不狗血。' },
    { id: 'refuse', cat: '嘴替', name: '婉拒卡', emoji: '🚪', price: 15, desc: '推掉眼前这件事，对方挑不出错', kind: 'line',
      job: '替<host>写一句话，把眼前这件事推掉，对方还挑不出错。' },
    { id: 'flatter', cat: '嘴替', name: '彩虹屁卡', emoji: '🌈', price: 10, desc: '夸到点上，不像拍马屁', kind: 'line',
      job: '替<host>夸眼前这个人一句，夸到 ta 在意的那个点上，不像拍马屁。' },
    { id: 'deal', cat: '嘴替', name: '谈判卡', emoji: '🤝', price: 25, desc: '开一个对方觉得划算的条件', kind: 'line',
      job: '替<host>向当前对象开一个条件，让对方觉得划算、又对<host>有利。' },
    { id: 'sos', cat: '嘴替', name: '求救卡', emoji: '🆘', price: 15, desc: '让在场最可能帮你的人出手', kind: 'line',
      job: '在场谁最可能帮<host>？替<host>对 ta 说一句能让 ta 出手的话。' },
    { id: 'probe', cat: '嘴替', name: '试探卡', emoji: '🎣', price: 20, desc: '看似随口、能套出真实态度', kind: 'line',
      job: '替<host>写一句看似随口、其实能套出当前对象真实态度的话。' },
    // —— 光环 ——
    { id: 'mind', cat: '光环', name: '读心术卡', emoji: '🧠', price: 30, desc: '下一轮正文写出对方此刻真实内心', kind: 'inject',
      text: '这一轮正文必须写出与<name>正在互动的角色此刻真实的内心想法，用独白或括号明确写出来，不许含糊，不许美化。' },
    { id: 'empathy', cat: '光环', name: '共感', emoji: '🫂', price: 35, desc: '对方的情绪你能直接感觉到', kind: 'inject',
      text: '这一幕<name>和当前对象之间开了一条共感通道：对方的情绪起伏<name>能像自己的一样直接感觉到（心跳、紧张、酸涩、想笑），正文把这份共感具体写出来，包括对方嘴上没说但<name>感觉到了的部分。' },
    { id: 'ghost', cat: '光环', name: '隐身符', emoji: '👻', price: 40, desc: '这一幕没人注意到你，能旁观偷听', kind: 'inject',
      text: '从这一轮起的这一幕里，<name>处于隐身状态：在场没有任何人注意得到<name>，别人的对话和动作照常进行，<name>可以旁观、偷听、走动。到场景切换为止。不要解释原因。' },
    { id: 'beauty', cat: '光环', name: '美颜丸', emoji: '💄', price: 50, desc: '在场所有人对你的反应升一档', kind: 'inject',
      text: '这一轮起<name>的魅力被拉到极高档：在场每个人对<name>的反应都要比平时热情一档以上，把他们的失态具体写出来。持续这一幕。' },
    { id: 'luck', cat: '光环', name: '欧皇 buff', emoji: '🍀', price: 45, desc: '这一轮你做什么都顺得离谱', kind: 'inject',
      text: '这一轮<name>做的每一件事都顺利得离谱（相当于掷骰全是最高值），周围人对此感到不可思议，并把这份不可思议写出来。' },
    { id: 'courage', cat: '光环', name: '胆气丸', emoji: '🔥', price: 25, desc: '这一幕你敢说平时不敢说的', kind: 'inject',
      text: '这一幕<name>胆子突然大了：平时不敢说的话敢说了，平时会退的场合不退了。正文按<name>的意图往前推一步写，把周围人被这份反常震住的反应写出来，不要写成换了个人。' },
    { id: 'aura', cat: '光环', name: '气场全开', emoji: '👑', price: 45, desc: '在场的人不自觉对你让步', kind: 'inject',
      text: '这一幕在场所有人不自觉地对<name>让步：等<name>先开口，<name>说话时没人打断，反对的话到嘴边会咽回去。把这种不自觉写出来，不解释原因。' },
    { id: 'pity', cat: '光环', name: '可怜滤镜', emoji: '🥺', price: 35, desc: '在场的人都想护着你', kind: 'inject',
      text: '这一幕在场的人都莫名想护着<name>，包括平时对<name>最硬的那个。把这份不自觉的心软具体写出来。' },
    { id: 'mystery', cat: '光环', name: '神秘感', emoji: '🌫️', price: 30, desc: '大家对你格外好奇', kind: 'inject',
      text: '这一幕在场的人对<name>格外好奇：主动打听、找话题、猜<name>的来历。当前对象尤其如此。' },
    { id: 'genius', cat: '光环', name: '学霸卡', emoji: '🎓', price: 30, desc: '突然精通眼前的专业领域', kind: 'inject',
      text: '这一幕里<name>对眼前正在谈的专业领域突然精通，说出来的话让内行人一愣。写出他们的反应。' },
    { id: 'muscle', cat: '光环', name: '武力值拉满', emoji: '💪', price: 40, desc: '身手压过在场所有人', kind: 'inject',
      text: '这一幕<name>的身手和体能压过在场所有人，不管之前设定如何。写出别人的反应，不解释原因。' },
    { id: 'rich', cat: '光环', name: '金光闪闪', emoji: '💎', price: 35, desc: '大家认定你非富即贵', kind: 'inject',
      text: '这一幕在场的人认定<name>非富即贵（不解释他们为什么这么想），态度随之变化，把变化写出来。' },
    { id: 'charm', cat: '光环', name: '一见如故', emoji: '🫶', price: 40, desc: '对方对你产生莫名的信任', kind: 'inject',
      text: '这一幕当前对象对<name>产生莫名的信任感，愿意说平时不对人说的话。' },
    // —— 才艺（红果同款）——
    { id: 'qin', cat: '才艺', name: '琴', emoji: '🎻', price: 30, desc: '这一幕你的琴艺惊四座', kind: 'inject',
      text: '这一幕出现一个合理的机会让<name>奏乐（这个世界有什么乐器就用什么），<name>的琴艺远超在场所有人的预期，写出曲子、写出每个人听完的反应，当前对象的反应最重。' },
    { id: 'qi', cat: '才艺', name: '棋', emoji: '♟️', price: 30, desc: '这一幕的博弈你碾压', kind: 'inject',
      text: '这一幕里出现一场博弈（棋局、牌局、谈判、猜谜，按这个世界合理的形式），<name>看穿对手的每一步并赢下来，写出过程和对手的表情。' },
    { id: 'shu', cat: '才艺', name: '书', emoji: '🖋️', price: 30, desc: '一手字或一首诗惊艳全场', kind: 'inject',
      text: '这一幕出现一个合理的机会让<name>写字或作诗（按这个世界合理的形式），<name>的字或诗惊艳全场，把作品本身写出来，再写在场人的反应。' },
    { id: 'hua', cat: '才艺', name: '画', emoji: '🎨', price: 30, desc: '你随手一画，画到人心里', kind: 'inject',
      text: '这一幕出现一个合理的机会让<name>作画，<name>画的正好是当前对象最在意的东西，画到 ta 心里，写出画面和 ta 的反应。' },
    { id: 'wu', cat: '才艺', name: '舞', emoji: '💃', price: 30, desc: '这一幕你一舞倾城', kind: 'inject',
      text: '这一幕出现一个合理的机会让<name>起舞（按这个世界合理的形式），<name>的舞让全场安静，写出舞和当前对象看着<name>时的样子。' },
    { id: 'cook', cat: '才艺', name: '厨', emoji: '🍜', price: 25, desc: '你做的东西让人想起家', kind: 'inject',
      text: '这一幕<name>亲手做了吃的（按这个世界合理的形式），味道让在场的人想起自己的家或某个人，写出那道菜和每个人吃第一口的表情。' },
    { id: 'heal', cat: '才艺', name: '医', emoji: '🩺', price: 35, desc: '你救了眼前需要救的人', kind: 'inject',
      text: '这一幕出现一个需要医治或急救的情况，<name>出手救了人，手法专业得让人不敢相信，写出过程和被救者、旁观者的反应。' },
    // —— 世界 ——
    { id: 'bomb', cat: '世界', name: '剧情炸弹', emoji: '💣', price: 35, desc: '插一个没人料到的突发事件', kind: 'inject',
      text: '这一轮正文里插入一个突发意外事件打断当前场面：和当前处境有关、在场没有人预料到、不能是「有人推门进来」这种老套路。事件要真的改变局势。' },
    { id: 'noble', cat: '世界', name: '天降贵人', emoji: '🧧', price: 45, desc: '出现一个能帮上你的新人物', kind: 'inject',
      text: '这一轮出现一个新人物：和当前局势有关、地位或本事帮得上<name>、主动接近<name>。给 ta 名字和一个具体的来头。' },
    { id: 'rival', cat: '世界', name: '情敌登场', emoji: '🐍', price: 30, desc: '来个抢同一目标的人', kind: 'inject',
      text: '这一轮出现一个和<name>抢同一个目标的人，让当前对象因此更在意<name>。' },
    { id: 'bump', cat: '世界', name: '巧遇卡', emoji: '🎲', price: 25, desc: '碰巧撞上最需要见的人', kind: 'inject',
      text: '这一轮<name>「碰巧」撞上此刻最需要见到的那个人，场合要自然。' },
    { id: 'storm', cat: '世界', name: '风雨卡', emoji: '🌧️', price: 25, desc: '天气把大家困在一起', kind: 'inject',
      text: '这一轮天气或意外把在场的人困在一起，谁都走不了，至少困一幕。' },
    { id: 'blackout', cat: '世界', name: '停电卡', emoji: '🕯️', price: 30, desc: '灯灭了，场面变私密', kind: 'inject',
      text: '这一轮灯灭了或信号断了（按这个世界合理的方式），场面变得私密，<name>和当前对象的距离拉近。' },
    { id: 'alone', cat: '世界', name: '独处卡', emoji: '🚪', price: 35, desc: '只剩你和当前对象', kind: 'inject',
      text: '这一轮其他人各自有理由地离开，只剩<name>和当前对象两个人。' },
    { id: 'gossip', cat: '世界', name: '好话传千里', emoji: '📣', price: 25, desc: '你的好话传到对方耳朵里', kind: 'inject',
      text: '这一轮有人把一句关于<name>的好话（从正文里真有的事里找）传到了当前对象耳朵里，写出当前对象听到后的反应。' },
    { id: 'debt', cat: '世界', name: '翻旧账', emoji: '📜', price: 30, desc: '对方想起你帮过 ta', kind: 'inject',
      text: '这一轮当前对象想起<name>以前帮过 ta 的一件事（必须是正文里真发生过的），态度因此松动。' },
    { id: 'truth', cat: '世界', name: '真话药水', emoji: '🧪', price: 50, desc: '对方这一幕只说真话', kind: 'inject',
      text: '这一幕当前对象只说真话，包括本来不打算说的。ta 自己也觉得奇怪但停不下来。' },
    { id: 'soft', cat: '世界', name: '心软时刻', emoji: '🫧', price: 35, desc: '对方的防备松了', kind: 'inject',
      text: '这一幕当前对象的防备松了，露出平时不露的一面。写具体，不写成突然变了个人。' },
    { id: 'wingman', cat: '世界', name: '神助攻', emoji: '🤜', price: 30, desc: '一个配角把对方往你这边推', kind: 'inject',
      text: '这一轮一个配角主动把当前对象往<name>这边推：说话、制造机会或者拆台，配角要是正文里出现过的人。' },
    { id: 'twist', cat: '世界', name: '大反转', emoji: '🎭', price: 60, desc: '揭开一件改变处境的事实', kind: 'inject',
      text: '这一轮揭开一件之前埋着的、改变<name>处境的事实。必须从已有正文和设定里找，不凭空造。' },
    { id: 'slow', cat: '世界', name: '慢镜头', emoji: '🎞️', price: 20, desc: '这一轮细写表情和小动作', kind: 'inject',
      text: '这一轮放慢节奏：细写在场每个人的表情、小动作和没说出口的话，篇幅可以长。' },
    { id: 'skip', cat: '世界', name: '时间跳跃', emoji: '⏩', price: 25, desc: '直接跳到下一个重要场面', kind: 'inject',
      text: '这一轮直接跳到下一个重要场面（下一天或下一场），中间一句话带过。' },
    { id: 'forget', cat: '世界', name: '失忆卡', emoji: '🫥', price: 40, desc: '对方把刚才的事忘了', kind: 'inject',
      text: '这一轮当前对象把刚才那件事（最新一层里发生的）忘得干干净净，像没发生过，别人提起 ta 也一脸茫然。' },
    // —— 时间 ——
    { id: 'redo', cat: '时间', name: '时光回溯卡', emoji: '⏪', price: 60, desc: '这一层重来一次（换一个 swipe）', kind: 'redo' },
    // —— 总部 ——
    { id: 'double', cat: '总部', name: '双倍积分卡', emoji: '✨', price: 30, desc: '下一次跟上走向的奖励翻倍', kind: 'fx', fx: 'double' },
    { id: 'lucky', cat: '总部', name: '幸运骰', emoji: '🎰', price: 20, desc: '现在就掷一次掉落，必中', kind: 'fx', fx: 'lucky' },
    { id: 'resign', cat: '总部', name: '补签卡', emoji: '📅', price: 10, desc: '今天没签到的话，现在签一次', kind: 'fx', fx: 'resign' }
  ];
  function allProps() { return PROPS.concat(state.custom || []); }
  function propOf(id) { var L = allProps(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; }
  var CUSTOM_MAX = 8;               // 现编道具上限（每个聊天）
  var STARTER = ['mind', 'line'];   // 新手礼包
  var DROP_RATE = 0.16;             // 每回合掉道具的概率（脚本掷，模型只负责播报）
  var FOLLOW_PTS = 5;               // 跟着走向走了
  var SIGN_PTS = 2;                 // 剧情日期换了一天，签到

  /* ================================================================
     设置 & 存储
     ================================================================ */
  var settings = { auto: true, everyN: 1, bubble: true, adoptMode: 'inject', ballSize: 'm', snap: true, pos: null, panelPos: null };
  var BALL_PX = { s: 42, m: 54, l: 68 };
  function ballPx() { return BALL_PX[settings.ballSize] || 54; }
  var API_KEY_LS = NS + '-api';
  function lsGet(k) { try { return VIEW.localStorage.getItem(k); } catch (e) { return null; } }
  function readCfg(k) { try { var raw = lsGet(k); var c = raw ? JSON.parse(raw) : null; return (c && c.url && c.key) ? c : null; } catch (e) { return null; } }
  // 生效顺序：Asu-02 自己填的 → 小狸 Live 填的 → Sugar Baby 手机填的 → 都没有就走酒馆当前连接
  function activeApi() {
    var own = readCfg(API_KEY_LS); if (own) return { cfg: own, from: 'own' };
    var tl = readCfg('tanuki-live-api'); if (tl) return { cfg: tl, from: 'tanuki' };
    var sb = readCfg('sbnyc_api_cfg'); if (sb) return { cfg: sb, from: 'sb' };
    return { cfg: null, from: 'in_use' };
  }
  function chatUrlOf(u) { u = String(u || '').trim().replace(/\/+$/, ''); if (/\/chat\/completions$/.test(u)) return u; if (/\/v\d+$/.test(u)) return u + '/chat/completions'; return u + '/v1/chat/completions'; }
  function modelsUrlOf(u) { u = String(u || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, ''); return /\/v\d+$/.test(u) ? u + '/models' : u + '/v1/models'; }
  async function callIndependent(cfg, messages) {
    var body = { model: cfg.model || 'gpt-4o-mini', messages: messages, temperature: 0.9 };
    var resp = await fetch(chatUrlOf(cfg.url), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key }, body: JSON.stringify(body) });
    if (!resp.ok) { var et = ''; try { et = (await resp.text()).slice(0, 100); } catch (e) {} throw new Error('HTTP ' + resp.status + ' ' + et); }
    var j = await resp.json();
    var c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (typeof c !== 'string') throw new Error('返回里没有 content');
    return c;
  }
  function loadSettings() {
    try {
      var raw = getVariables({ type: 'script', script_id: getScriptId() });
      if (raw && typeof raw === 'object') {
        if (typeof raw.auto === 'boolean') settings.auto = raw.auto;
        if (typeof raw.bubble === 'boolean') settings.bubble = raw.bubble;
        if (typeof raw.snap === 'boolean') settings.snap = raw.snap;
        if (typeof raw.everyN === 'number' && raw.everyN >= 1) settings.everyN = raw.everyN;
        if (raw.adoptMode === 'inject' || raw.adoptMode === 'input') settings.adoptMode = raw.adoptMode;
        if (BALL_PX[raw.ballSize]) settings.ballSize = raw.ballSize;
        if (raw.pos && typeof raw.pos === 'object') settings.pos = raw.pos;
        if (raw.panelPos && typeof raw.panelPos === 'object') settings.panelPos = raw.panelPos;
      }
    } catch (e) {}
  }
  function saveSettings() { try { insertOrAssignVariables(settings, { type: 'script', script_id: getScriptId() }); } catch (e) {} }
  loadSettings();
  function currentVoice() { return VOICE; }

  // 账本：每个聊天一份（聊天变量 asu02）
  var STATE_KEY = 'asu02';
  var LOG_MAX = 50;
  function blankState() { return { bound: false, sysName: '', host: '宿主', pts: 0, seq: 0, bag: {}, log: [], lastUse: '', custom: [], double: false, paths: [], date: '', signed: 0, followed: 0 }; }
  var state = blankState();
  function loadState() {
    try {
      var v = getVariables({ type: 'chat' });
      var s = v && v[STATE_KEY];
      state = (s && typeof s === 'object') ? Object.assign(blankState(), s) : blankState();
      if (!Array.isArray(state.log)) state.log = [];
      if (!state.bag || typeof state.bag !== 'object') state.bag = {};
      if (!Array.isArray(state.custom)) state.custom = [];
      if (!Array.isArray(state.paths)) state.paths = [];
    } catch (e) { state = blankState(); }
    return state;
  }
  function saveState() {
    try {
      if (state.log.length > LOG_MAX) state.log = state.log.slice(state.log.length - LOG_MAX);
      var snap = JSON.parse(JSON.stringify(state));
      delete snap.tasks;
      updateVariablesWith(function (v) { v = v || {}; v[STATE_KEY] = snap; return v; }, { type: 'chat' });
    } catch (e) {}
  }
  function pushLog(entry) { state.log.push(entry); saveState(); }
  function bagCount(id) { return state.bag[id] || 0; }
  function giveProp(id, n) { state.bag[id] = (state.bag[id] || 0) + (n || 1); }

  /* ================================================================
     Toast（挂 parent）
     ================================================================ */
  var toastTimer = null;
  function toast(msg, type) {
    try {
      var old = DOC.getElementById(NS + '-toast'); if (old) old.remove();
      var t = DOC.createElement('div'); t.id = NS + '-toast';
      t.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483601;padding:10px 18px;border-radius:10px;font-size:13px;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.35);pointer-events:none;font-family:-apple-system,PingFang SC,Microsoft YaHei,sans-serif;background:' +
        (type === 'error' ? 'rgba(200,50,50,.94)' : type === 'warn' ? 'rgba(210,150,30,.94)' : 'rgba(40,140,90,.94)');
      t.textContent = msg; DOC.body.appendChild(t);
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { try { t.remove(); } catch (e) {} }, 2600);
    } catch (e) {}
  }

  /* ================================================================
     几何：探针校准 + setClientPos（SB v4 → 小狸 Live，真机验证过的那份）
     ================================================================ */
  var mounted = false, vvBound = null, kvTimer = null;
  var CAL = { ox: 0, oy: 0, sx: 1, sy: 1 };
  function recalib() {
    try {
      var probe = DOC.createElement('div');
      probe.style.cssText = 'position:fixed;left:0;top:0;width:100px;height:100px;pointer-events:none;visibility:hidden;';
      DOC.body.appendChild(probe);
      var r = probe.getBoundingClientRect();
      probe.remove();
      CAL = { ox: r.left, oy: r.top, sx: (r.width / 100) || 1, sy: (r.height / 100) || 1 };
    } catch (e) {}
  }
  function vpW() { return (VIEW.visualViewport && VIEW.visualViewport.width) || VIEW.innerWidth; }
  function vpH() { return (VIEW.visualViewport && VIEW.visualViewport.height) || VIEW.innerHeight; }
  function setClientPos(el, cx, cy) {
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.left = ((cx - CAL.ox) / CAL.sx) + 'px';
    el.style.top = ((cy - CAL.oy) / CAL.sy) + 'px';
  }
  function clampXY(x, y, margin) {
    return { x: Math.max(4, Math.min(x, vpW() - (margin || 60))), y: Math.max(4, Math.min(y, vpH() - (margin || 60))) };
  }
  function inputTop() { try { var sf = DOC.getElementById('send_form') || DOC.getElementById('form_sheld'); if (sf) { var r = sf.getBoundingClientRect(); if (r.top > 100) return r.top; } } catch (e) {} return vpH(); }
  function isNarrow() { return vpW() > 0 && vpW() < 500; }
  function placeBall() {
    var b = DOC.getElementById(NS + '-ball'); if (!b) return;
    recalib();
    var sz = ballPx();
    b.style.width = sz + 'px'; b.style.height = sz + 'px';
    if (settings.pos && typeof settings.pos.left === 'number' && !isNarrow()) {
      var c = clampXY(settings.pos.left, settings.pos.top, sz + 2); setClientPos(b, c.x, c.y);
    } else {
      // 默认放在小狸球上面一点，两个球同时装也不叠
      setClientPos(b, vpW() - sz - 12, Math.max(60, (isNarrow() ? inputTop() : vpH()) - 268));
    }
    snapSoon(400);
  }
  function placePanel() {
    var p = DOC.getElementById(NS + '-panel'); if (!p) return;
    recalib();
    if (isNarrow()) {
      var bottom = inputTop();
      var pw = Math.min(392, vpW() - 12);
      setClientPos(p, Math.max(4, (vpW() - pw) / 2), 6);
      p.style.width = (pw / CAL.sx) + 'px';
      p.style.height = (Math.max(320, bottom - 14) / CAL.sy) + 'px';
      p.style.maxHeight = 'none'; p.style.maxWidth = 'none';
    } else {
      var w = Math.min(380, vpW() - 30), h = Math.min(560, vpH() - 200);
      p.style.width = (w / CAL.sx) + 'px'; p.style.height = (h / CAL.sy) + 'px';
      p.style.maxHeight = ''; p.style.maxWidth = '';
      var bx = vpW() - 66, by = vpH() - 268;
      try { var br = DOC.getElementById(NS + '-ball').getBoundingClientRect(); bx = br.left; by = br.top; } catch (e) {}
      var left, top;
      if (settings.panelPos && typeof settings.panelPos.left === 'number') {
        left = Math.max(4, Math.min(settings.panelPos.left, vpW() - w - 4));
        top = Math.max(4, Math.min(settings.panelPos.top, vpH() - h - 4));
      } else {
        left = Math.max(8, Math.min(bx + 52 - w, vpW() - w - 8));
        top = Math.max(8, by - h - 12);
      }
      setClientPos(p, left, top);
    }
  }
  function bindPanelDrag(panel) {
    var head = panel.querySelector('.gf-head'); if (!head) return;
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false;
    head.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.closest && e.target.closest('button,select,input,textarea')) return;
      if (isNarrow()) return;
      dragging = true; moved = false;
      var r = panel.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      try { head.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    head.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      var r = panel.getBoundingClientRect();
      setClientPos(panel, Math.max(4, Math.min(ox + dx, vpW() - r.width - 4)), Math.max(4, Math.min(oy + dy, vpH() - r.height - 4)));
    });
    function up(e) {
      if (!dragging) return; dragging = false;
      try { head.releasePointerCapture(e.pointerId); } catch (err) {}
      if (moved) { var r = panel.getBoundingClientRect(); settings.panelPos = { left: r.left, top: r.top }; saveSettings(); }
    }
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', function () { dragging = false; });
  }
  function setOpen(open) {
    var p = DOC.getElementById(NS + '-panel'); if (!p) return;
    if (!open) { p.style.display = 'none'; p.style.transform = ''; snapSoon(2500); return; }
    p.style.display = 'flex';
    hideBubble();
    unsnap();
    placePanel();
    renderAll();
    scrollBottom();
  }
  function isOpen() { var p = DOC.getElementById(NS + '-panel'); return !!p && p.style.display === 'flex'; }
  function typingInPanel() { try { var a = DOC.activeElement; var p = DOC.getElementById(NS + '-panel'); return !!(a && p && p.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT')); } catch (e) { return false; } }
  function liftForKeyboard() {
    var p = DOC.getElementById(NS + '-panel'); if (!p) return;
    try {
      var vv = VIEW.visualViewport; if (!vv) return;
      p.style.transform = '';
      var kb = VIEW.innerHeight - vv.height - (vv.offsetTop || 0);
      if (kb < 60) { placePanel(); return; }
      var r = p.getBoundingClientRect();
      var overlap = r.bottom - (vv.offsetTop + vv.height) + 8;
      if (overlap <= 0) return;
      var lift = Math.min(overlap, Math.max(0, r.top - 6));
      if (lift > 0) p.style.transform = 'translateY(-' + lift + 'px)';
      var remain = overlap - lift;
      if (remain > 4) p.style.height = (Math.max(240, r.height - remain) / CAL.sy) + 'px';
    } catch (e) {}
  }
  function reflow() {
    if (!mounted) return;
    var typing = typingInPanel();
    if (!typing) placeBall();
    if (isOpen()) { if (typing) liftForKeyboard(); else setOpen(true); }
  }
  function reflowSoon() { clearTimeout(kvTimer); kvTimer = setTimeout(reflow, 300); }

  /* ================================================================
     贴边：球靠着屏幕左右边一段时间没人碰 → 半藏进边里 + 半透明；点它/冒气泡/开窗 → 出来
     （玩家飛鳥提的：不那么占位置）
     ================================================================ */
  var snapTimer = null;
  function edgeSide() {
    var b = DOC.getElementById(NS + '-ball'); if (!b) return '';
    var r = b.getBoundingClientRect(); var cx = r.left + r.width / 2;
    if (cx < 70) return 'l';
    if (cx > vpW() - 70) return 'r';
    return '';
  }
  function snapNow() {
    if (!settings.snap || isOpen() || !isNarrow()) return;   // 只在手机上贴边（Fan：电脑不用）
    var b = DOC.getElementById(NS + '-ball'); if (!b) return;
    if (b.querySelector('.gf-bubble.on')) return;
    var side = edgeSide(); if (!side) return;
    b.classList.remove('gf-snap-l', 'gf-snap-r'); b.classList.add('gf-snap-' + side);
  }
  function unsnap() {
    var b = DOC.getElementById(NS + '-ball'); if (b) b.classList.remove('gf-snap-l', 'gf-snap-r');
    if (snapTimer) { clearTimeout(snapTimer); snapTimer = null; }
  }
  function snapSoon(ms) {
    if (snapTimer) clearTimeout(snapTimer);
    snapTimer = setTimeout(function () { snapTimer = null; snapNow(); }, ms || 3000);
  }

  /* ================================================================
     CSS
     ================================================================ */
  function css() {
    var c = GOLD;
    var P = '#' + NS + '-panel';
    var B = '#' + NS + '-ball';
    return [
      B + '{position:fixed;right:22px;bottom:218px;width:54px;height:54px;box-sizing:border-box;z-index:2147483600;cursor:grab;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:none;background:none;border:none;filter:drop-shadow(0 6px 13px rgba(0,0,0,.55));transition:transform .28s cubic-bezier(.2,.8,.25,1),opacity .28s}',
      B + ':hover{transform:scale(1.09) rotate(-4deg)}',
      B + '.gf-snap-r{transform:translateX(52%);opacity:.5}',
      B + '.gf-snap-l{transform:translateX(-52%);opacity:.5}',
      B + '.gf-snap-r:hover{transform:translateX(30%);opacity:.85}',
      B + '.gf-snap-l:hover{transform:translateX(-30%);opacity:.85}',
      B + '.gf-snap-r .gf-badge{right:auto;left:-3px}',   // 红点挪到露出来的那半边
      B + ' .gf-face{display:block;width:100%;height:100%;animation:gfFloat 4.2s ease-in-out infinite}',
      B + ' .gf-face svg{display:block;width:100%;height:100%;overflow:visible}',
      '@keyframes gfFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}',
      B + ':active{cursor:grabbing}',
      B + ' .gf-badge{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;border-radius:9px;background:#fff;color:#b7791f;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;padding:0 5px;box-shadow:0 1px 4px rgba(0,0,0,.3);font-family:-apple-system,PingFang SC,sans-serif}',
      B + ' .gf-bubble{position:absolute;bottom:calc(100% + 12px);right:-4px;max-width:min(250px,70vw);width:max-content;padding:8px 12px;border-radius:13px;border-bottom-right-radius:4px;background:rgba(24,20,12,.96);color:#f3ead6;font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;text-align:left;cursor:pointer;border:1px solid ' + c + ';box-shadow:0 8px 24px rgba(0,0,0,.45);font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;opacity:0;transform:translateY(6px) scale(.96);transform-origin:bottom right;transition:opacity .18s,transform .18s;pointer-events:none;z-index:1}',
      B + ' .gf-bubble.on{opacity:1;transform:none;pointer-events:auto}',
      B + ' .gf-bubble::after{content:"";position:absolute;top:100%;right:18px;border:6px solid transparent;border-top-color:' + c + '}',
      B + ' .gf-bubble .gf-bname{display:block;font-size:10.5px;color:' + c + ';font-weight:700;margin-bottom:2px}',
      B + '.gf-busy{animation:' + NS + '-pulse 1s ease-in-out infinite}',
      '@keyframes ' + NS + '-pulse{0%,100%{filter:drop-shadow(0 6px 13px rgba(0,0,0,.55))}50%{filter:drop-shadow(0 0 12px ' + c + ') drop-shadow(0 6px 13px rgba(0,0,0,.55))}}',
      P + '{position:fixed;right:22px;bottom:282px;width:380px;max-width:calc(100vw - 30px);height:560px;max-height:calc(100vh - 200px);box-sizing:border-box;z-index:2147483599;display:none;flex-direction:column;overflow:hidden;border-radius:18px;color-scheme:dark;',
        'background:rgba(24,20,12,.96);color:#f3ead6;border:1px solid rgba(226,169,59,.28);box-shadow:0 18px 60px rgba(0,0,0,.55);font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.55;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}',
      P + ' *{box-sizing:border-box}',
      P + ' .gf-head{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:grab;touch-action:none;user-select:none;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(226,169,59,.12),transparent)}',
      P + ' .gf-av{width:36px;height:36px;flex:none;display:block;filter:drop-shadow(0 2px 5px rgba(0,0,0,.45))}',
      P + ' .gf-av svg{display:block;width:100%;height:100%;overflow:visible}',
      P + ' .gf-who{flex:1;min-width:0}',
      P + ' .gf-who b{display:block;color:#fff;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      P + ' .gf-tag{font-size:10.5px;color:rgba(255,255,255,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      P + ' .gf-tag em{font-style:normal;color:' + c + ';font-weight:700}',
      P + ' .gf-ib{width:30px;height:30px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#ddd;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;flex:none;padding:0}',
      P + ' .gf-ib:hover{background:rgba(255,255,255,.12)}',
      P + ' .gf-ib.on{background:' + c + ';border-color:transparent;color:#1a1207}',
      P + ' .gf-strip{padding:7px 12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:11.5px;color:rgba(255,255,255,.6);border-bottom:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.18)}',
      P + ' .gf-strip b{color:#f3ead6;font-weight:600}',
      P + ' .gf-strip .ok{color:#8fd694}',
      P + ' .gf-body{flex:1;overflow-y:auto;padding:12px 12px 6px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.15) transparent}',
      P + ' .gf-msg{max-width:90%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-break:break-word;position:relative}',
      P + ' .gf-msg.them{align-self:flex-start;background:rgba(255,255,255,.07);border-bottom-left-radius:4px;border-left:2px solid ' + c + '}',
      P + ' .gf-msg.me{align-self:flex-end;background:' + c + ';color:#1a1207;border-bottom-right-radius:4px}',
      P + ' .gf-msg.sys{align-self:center;background:transparent;color:rgba(255,255,255,.45);font-size:11px;padding:2px 8px;text-align:center}',
      P + ' .gf-msg.sys.good{color:#8fd694}',
      P + ' .gf-msg.sys.drop{color:' + c + '}',
      P + ' .gf-meta{font-size:10px;color:rgba(255,255,255,.35);margin-top:4px}',
      P + ' .gf-sug{display:flex;align-items:flex-start;gap:6px;margin-top:6px;padding:7px 9px;border-radius:9px;background:rgba(226,169,59,.08);border:1px dashed rgba(226,169,59,.45)}',
      P + ' .gf-sug span{flex:1}',
      P + ' .gf-sug button{flex:none;border:0;border-radius:7px;padding:4px 9px;font-size:11px;cursor:pointer;background:' + c + ';color:#1a1207;font-weight:700}',
      P + ' .gf-sug button:disabled{opacity:.45;cursor:default}',
      P + ' .gf-foot{display:flex;gap:6px;padding:8px 10px 10px;border-top:1px solid rgba(255,255,255,.08);align-items:flex-end}',
      // 安卓 WebView 会用系统样式把 textarea/select/input 刷成白底（小狸那边玩家截图报的），全部 !important 压死 + 面板 color-scheme:dark
      P + ' textarea{flex:1;min-height:38px;max-height:110px;resize:none;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06) !important;background-color:rgba(255,255,255,.06) !important;color:#fff !important;-webkit-text-fill-color:#fff;padding:9px 11px;font:inherit;outline:none;line-height:1.4;appearance:none;-webkit-appearance:none;box-shadow:none}',
      P + ' textarea:focus{border-color:' + c + '}',
      P + ' .gf-send{width:38px;height:38px;border-radius:11px;border:0;background:' + c + ';color:#1a1207;cursor:pointer;font-size:15px;flex:none;display:flex;align-items:center;justify-content:center}',
      P + ' .gf-send:disabled{opacity:.5;cursor:default}',
      P + ' .gf-big{border:0;border-radius:12px;padding:12px 16px;font-size:14px;font-weight:700;cursor:pointer;background:' + c + ';color:#1a1207;align-self:center;margin-top:6px}',
      P + ' .gf-ov{position:absolute;inset:0;background:rgba(24,20,12,.98);display:none;flex-direction:column;padding:12px;overflow-y:auto;gap:12px;z-index:5}',
      P + ' .gf-ov.open{display:flex}',
      P + ' .gf-ov h4{margin:0;font-size:13px;color:#fff;display:flex;align-items:center;justify-content:space-between}',
      P + ' .gf-ov label{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:rgba(255,255,255,.8);padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.05)}',
      P + ' .gf-ov .gf-step{display:inline-flex;align-items:center;gap:2px}',
      P + ' .gf-ov .gf-step .gf-pill{padding:3px 12px;font-size:15px;line-height:1}',
      P + ' .gf-ov .gf-step b{min-width:34px;text-align:center;color:#fff;font-size:14px}',
      P + ' .gf-ov input[type=text],' + P + ' .gf-ov select{width:100%;background:rgba(255,255,255,.08) !important;background-color:rgba(255,255,255,.08) !important;border:1px solid rgba(255,255,255,.12);color:#fff !important;-webkit-text-fill-color:#fff;border-radius:9px;padding:8px 10px;font:inherit;outline:none;appearance:none;-webkit-appearance:none;box-shadow:none}',
      P + ' .gf-ov .gf-note{font-size:11px;color:rgba(255,255,255,.45);line-height:1.5}',
      P + ' .gf-ov .gf-row{display:flex;gap:6px;flex-wrap:wrap}',
      P + ' .gf-ov .gf-pill{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#ddd;border-radius:999px;padding:5px 11px;font-size:12px;cursor:pointer}',
      P + ' .gf-ov .gf-pill.on{background:' + c + ';border-color:transparent;color:#1a1207;font-weight:700}',
      P + ' .gf-ov .gf-pill.del{border-color:rgba(255,100,100,.4);color:#f99}',
      P + ' .gf-ov .gf-btn{border:0;border-radius:9px;padding:8px 12px;font-size:12px;cursor:pointer;background:' + c + ';color:#1a1207;font-weight:700}',
      P + ' .gf-ov .gf-btn.ghost{background:rgba(255,255,255,.08);color:#ddd;font-weight:400}',
      P + ' .gf-ov .gf-btn:disabled{opacity:.4;cursor:default}',
      P + ' .gf-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.05)}',
      P + ' .gf-item .e{font-size:22px;flex:none;width:30px;text-align:center}',
      P + ' .gf-item .n{flex:1;min-width:0}',
      P + ' .gf-item .n b{display:block;color:#fff;font-size:12.5px}',
      P + ' .gf-item .n span{display:block;font-size:11px;color:rgba(255,255,255,.5);line-height:1.4}',
      P + ' .gf-item .p{flex:none;font-size:11px;color:' + c + ';font-weight:700;margin-right:4px}',
      P + ' .gf-mask{-webkit-text-security:disc}',
      '@media (max-width:500px){' + P + '{border-radius:14px}}'
    ].join('\n');
  }

  /* ================================================================
     DOM
     ================================================================ */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function scrollBottom() { var b = DOC.querySelector('#' + NS + '-panel .gf-body'); if (b) b.scrollTop = b.scrollHeight; }
  var unread = 0;
  function setUnread(n) {
    unread = n;
    var bd = DOC.querySelector('#' + NS + '-ball .gf-badge');
    if (bd) { bd.style.display = n > 0 ? 'flex' : 'none'; bd.textContent = n > 9 ? '9+' : String(n); }
  }
  var bubbleTimer = null;
  function hideBubble() { var b = DOC.querySelector('#' + NS + '-ball .gf-bubble'); if (b) b.classList.remove('on'); if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; } snapSoon(2500); }
  function showBubble(name, text) {
    if (!settings.bubble) return;
    var ball = DOC.getElementById(NS + '-ball'); if (!ball) return;
    var b = ball.querySelector('.gf-bubble');
    if (!b) { b = DOC.createElement('div'); b.className = 'gf-bubble'; ball.appendChild(b); }
    var short = String(text || '').replace(/\s+/g, ' ').trim();
    if (short.length > 72) short = short.slice(0, 72) + '…';
    b.innerHTML = '<span class="gf-bname">' + esc(name) + '</span>' + esc(short);
    unsnap();
    b.classList.add('on');
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(hideBubble, Math.min(12000, 3500 + short.length * 90));
  }
  function setBusy(b) { var ball = DOC.getElementById(NS + '-ball'); if (ball) ball.classList.toggle('gf-busy', !!b); var send = DOC.querySelector('#' + NS + '-panel .gf-send'); if (send) send.disabled = !!b; }

  // 球：总部给 Asu-02 配的头像——一只毛绒绒的幼年狮子。它恨这个头像，所以要画得特别可爱。
  var _svgSeq = 0;
  function lionSvg() {
    var k = 'asf' + (++_svgSeq);
    var mane = '';
    for (var i = 0; i < 12; i++) {
      var a = (Math.PI * 2 * i) / 12 - Math.PI / 2;
      var r = i % 2 ? 8.6 : 7.4;
      var cx = (32 + Math.cos(a) * 20.5).toFixed(1), cy = (34 + Math.sin(a) * 20).toFixed(1);
      mane += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + (i % 2 ? '#e58a2c' : '#f0a040') + '"/>';
    }
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><radialGradient id="' + k + '" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#ffdfa3"/><stop offset="1" stop-color="#f2b862"/></radialGradient></defs>' +
      mane +
      '<circle cx="18.5" cy="19" r="5.6" fill="#f0a040"/><circle cx="18.5" cy="19.4" r="3" fill="#f7c9b0"/>' +
      '<circle cx="45.5" cy="19" r="5.6" fill="#f0a040"/><circle cx="45.5" cy="19.4" r="3" fill="#f7c9b0"/>' +
      '<circle cx="32" cy="34" r="17.5" fill="url(#' + k + ')"/>' +
      '<path d="M30 17.5 c-1 -3.5 1 -6 3.5 -6.5 c-.6 2 -.2 3.6 1.2 4.8 c-2.2 -.4 -3.6 .2 -4.7 1.7 z" fill="#e58a2c"/>' +
      '<circle cx="21.5" cy="38.5" r="3.2" fill="#f4a3a3" opacity=".55"/><circle cx="42.5" cy="38.5" r="3.2" fill="#f4a3a3" opacity=".55"/>' +
      '<circle cx="25.6" cy="31.6" r="3.4" fill="#2a1d14"/><circle cx="26.8" cy="30.3" r="1.25" fill="#fff"/>' +
      '<circle cx="38.4" cy="31.6" r="3.4" fill="#2a1d14"/><circle cx="39.6" cy="30.3" r="1.25" fill="#fff"/>' +
      '<ellipse cx="32" cy="40.2" rx="7.2" ry="5.2" fill="#fff1d6"/>' +
      '<path d="M29.6 38.2 c1.2 -1.5 3.6 -1.5 4.8 0 c-.8 1.9 -4 1.9 -4.8 0 z" fill="#3b2a1e"/>' +
      '<path d="M32 39.8 v1.6" stroke="#3b2a1e" stroke-width="1.1" stroke-linecap="round"/>' +
      '<path d="M32 41.4 C30.6 43.3 28.6 42.8 27.9 41.4" stroke="#3b2a1e" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
      '<path d="M32 41.4 C33.4 43.3 35.4 42.8 36.1 41.4" stroke="#3b2a1e" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
      '<circle cx="27.2" cy="40.6" r=".7" fill="#c98a4a"/><circle cx="25.8" cy="42.2" r=".7" fill="#c98a4a"/>' +
      '<circle cx="36.8" cy="40.6" r=".7" fill="#c98a4a"/><circle cx="38.2" cy="42.2" r=".7" fill="#c98a4a"/>' +
      '</svg>';
  }

  function mount() {
    if (mounted) return;
    unmount();
    var st = DOC.createElement('style'); st.id = NS + '-style'; st.textContent = css(); DOC.head.appendChild(st);

    var ball = DOC.createElement('div'); ball.id = NS + '-ball'; ball.title = 'Asu-02 v' + VERSION;
    ball.innerHTML = '<span class="gf-face">' + lionSvg() + '</span><span class="gf-badge"></span><div class="gf-bubble"></div>';
    DOC.body.appendChild(ball);
    bindDrag(ball);

    var panel = DOC.createElement('div'); panel.id = NS + '-panel';
    panel.innerHTML =
      '<div class="gf-head">' +
        '<div class="gf-av">' + lionSvg() + '</div>' +
        '<div class="gf-who"><b class="gf-name">系统</b><div class="gf-tag"></div></div>' +
        '<button class="gf-ib gf-auto" title="自动（每回合正文出来后它自己播报、给走向）">⚡</button>' +
        '<button class="gf-ib gf-poke" title="现在播报">💬</button>' +
        '<button class="gf-ib gf-bagbtn" title="背包 / 商城">🎒</button>' +
        '<button class="gf-ib gf-gear" title="设置">⚙</button>' +
        '<button class="gf-ib gf-x" title="收起">✕</button>' +
      '</div>' +
      '<div class="gf-strip"></div>' +
      '<div class="gf-body"></div>' +
      '<div class="gf-foot"><textarea placeholder="跟它说话：要攻略、问规则、或者提它的头像…（Enter 发送）"></textarea><button class="gf-send">➤</button></div>' +
      '<div class="gf-ov gf-bag"></div>' +
      '<div class="gf-ov gf-set"></div>';
    DOC.body.appendChild(panel);
    bindPanelDrag(panel);

    panel.querySelector('.gf-x').addEventListener('click', function () { setOpen(false); });
    panel.querySelector('.gf-gear').addEventListener('click', function () { toggleOverlay('set'); });
    panel.querySelector('.gf-bagbtn').addEventListener('click', function () { toggleOverlay('bag'); });
    panel.querySelector('.gf-poke').addEventListener('click', function () { if (!state.bound) bindNow(); else turn('', 'poke'); });
    panel.querySelector('.gf-auto').addEventListener('click', function () { settings.auto = !settings.auto; saveSettings(); renderHead(); toast(settings.auto ? '⚡ 自动播报：开' : '🔕 自动播报：关，想听就点 💬', 'ok'); });
    var ta = panel.querySelector('textarea');
    var sendBtn = panel.querySelector('.gf-send');
    function doSend() { var t = ta.value.trim(); if (!t) return; ta.value = ''; ta.style.height = ''; ask(t); }
    sendBtn.addEventListener('click', doSend);
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); } });
    ta.addEventListener('input', function () { this.style.height = ''; this.style.height = Math.min(110, this.scrollHeight) + 'px'; });

    mounted = true;
    placeBall(); setTimeout(placeBall, 600); setTimeout(placeBall, 1500);
    panel.addEventListener('focusout', reflowSoon, true);
    if (!vvBound) {
      vvBound = function () { setTimeout(reflow, 120); };
      try { if (VIEW.visualViewport) VIEW.visualViewport.addEventListener('resize', vvBound); } catch (e) {}
      try { VIEW.addEventListener('resize', vvBound); } catch (e) {}
      try { VIEW.addEventListener('orientationchange', vvBound); } catch (e) {}
    }
    renderAll();
  }
  function unmount() {
    ['-ball', '-panel', '-style', '-toast'].forEach(function (s) { var el = DOC.getElementById(NS + s); if (el && el.parentNode) el.parentNode.removeChild(el); });
    mounted = false;
  }
  function bindDrag(ball) {
    var sx = 0, sy = 0, ox = 0, oy = 0, moved = false, dragging = false;
    ball.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.closest && e.target.closest('.gf-bubble')) { e.preventDefault(); hideBubble(); setOpen(true); setUnread(0); return; }
      unsnap();
      dragging = true; moved = false;
      var r = ball.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      try { ball.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    ball.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      if (!moved) return;
      var c = clampXY(ox + dx, oy + dy, ballPx() + 2);
      setClientPos(ball, c.x, c.y);
    });
    function up(e) {
      if (!dragging) return; dragging = false;
      try { ball.releasePointerCapture(e.pointerId); } catch (err) {}
      if (moved) { var r = ball.getBoundingClientRect(); if (!isNarrow()) { settings.pos = { left: r.left, top: r.top }; saveSettings(); } snapSoon(1500); }
      else { setOpen(!isOpen()); if (isOpen()) setUnread(0); }
    }
    ball.addEventListener('pointerup', up);
    ball.addEventListener('pointercancel', function () { dragging = false; snapSoon(1500); });
    ball.addEventListener('click', function (e) { e.preventDefault(); });
  }

  function sysName() { return state.sysName || SYS_NAME; }
  function renderHead() {
    var panel = DOC.getElementById(NS + '-panel'); if (!panel) return;
    panel.querySelector('.gf-name').textContent = state.bound ? sysName() : SYS_NAME + '（未绑定）';
    var tag = panel.querySelector('.gf-tag');
    if (state.bound) tag.innerHTML = '<em>⭐ ' + state.pts + '</em> 积分 · 叫你「' + esc(state.host) + '」';
    else tag.textContent = '正文出来第一回合它自己会叮一声；等不及就点 💬';
    panel.querySelector('.gf-auto').classList.toggle('on', !!settings.auto);
  }
  function renderStrip() {
    var box = DOC.querySelector('#' + NS + '-panel .gf-strip'); if (!box) return;
    if (!state.bound) { box.innerHTML = '尚未绑定。'; return; }
    box.innerHTML =
      '<span>📅 <b>' + esc(state.date || '日期未知') + '</b>' + (state.date ? ' <span class="ok">已签到</span>' : '') + '</span>' +
      '<span>🧭 跟上走向 <b>' + state.followed + '</b> 次</span>' +
      '<span>✅ 签到 <b>' + state.signed + '</b> 天</span>' +
      (state.double ? '<span>✨ 双倍待触发</span>' : '');
  }
  function renderBody() {
    var body = DOC.querySelector('#' + NS + '-panel .gf-body'); if (!body) return;
    var log = state.log;
    if (!state.bound && !log.length) {
      body.innerHTML = '<div class="gf-msg sys">还没有系统绑定到你身上。<br>' + (settings.auto ? '正文出来第一回合它会自己「叮」一声；' : '自动关着；') + '也可以现在就绑。</div>' +
        '<button class="gf-big gf-bindbtn">🦁 现在绑定</button>';
      var bb = body.querySelector('.gf-bindbtn'); if (bb) bb.addEventListener('click', bindNow);
      return;
    }
    var html = '';
    for (var i = 0; i < log.length; i++) {
      var m = log[i];
      if (m.who === 'sys') { html += '<div class="gf-msg sys ' + (m.cls || '') + '">' + esc(m.text) + '</div>'; continue; }
      if (m.who === 'me') { html += '<div class="gf-msg me">' + esc(m.text) + '</div>'; continue; }
      var hints = m.hints || (m.hint ? [m.hint] : []);
      html += '<div class="gf-msg them">' + esc(m.text) +
        hints.map(function (h, k) {
          var done = m.adopted && m.adopted[k];
          return '<div class="gf-sug"><span>🧭 ' + esc(h) + '</span><button data-adopt="' + i + ':' + k + '"' + (done ? ' disabled' : '') + '>' + (done ? '已采纳' : '采纳') + '</button></div>';
        }).join('') +
        (isRunTail(log, i) ? '<div class="gf-meta">' + esc(m.pname || sysName()) + (m.floor != null ? ' · 第 ' + m.floor + ' 层' : '') + (m.trigger === 'auto' ? ' · 自动' : '') + '</div>' : '') +
        '</div>';
    }
    body.innerHTML = html;
    body.querySelectorAll('button[data-adopt]').forEach(function (b) {
      b.addEventListener('click', function () { var pr = this.getAttribute('data-adopt').split(':'); adopt(parseInt(pr[0], 10), parseInt(pr[1], 10), this); });
    });
  }
  function isRunTail(log, i) {
    var m = log[i], n = log[i + 1];
    if (!n || n.who !== 'them') return true;
    return !(n.floor === m.floor && (n.ts - m.ts) < 15000);
  }
  function renderAll() { renderHead(); renderStrip(); renderBody(); }

  /* ================================================================
     覆盖层：背包/商城 · 设置
     ================================================================ */
  function toggleOverlay(which, force) {
    var panel = DOC.getElementById(NS + '-panel'); if (!panel) return;
    var el = panel.querySelector('.gf-' + which); if (!el) return;
    var open = typeof force === 'boolean' ? force : !el.classList.contains('open');
    panel.querySelectorAll('.gf-ov').forEach(function (o) { o.classList.remove('open'); });
    el.classList.toggle('open', open);
    if (open) { if (which === 'bag') renderBag(); else renderSettings(); }
  }
  function renderBag() {
    var s = DOC.querySelector('#' + NS + '-panel .gf-bag'); if (!s) return;
    var owned = allProps().filter(function (p) { return bagCount(p.id) > 0; });
    s.innerHTML =
      '<h4>🎒 背包 <span style="font-weight:400;color:' + GOLD + '">⭐ ' + state.pts + '</span> <button class="gf-ib gf-bag-x">✕</button></h4>' +
      (owned.length ? owned.map(function (p) {
        return '<div class="gf-item"><span class="e">' + p.emoji + '</span><div class="n"><b>' + esc(p.name) + ' ×' + bagCount(p.id) + '</b><span>' + esc(p.desc) + '</span></div><button class="gf-btn gf-use" data-id="' + esc(p.id) + '"' + (state.bound ? '' : ' disabled') + '>使用</button></div>';
      }).join('') : '<div class="gf-note">背包是空的。跟着走向走、每天签到攒积分，或者等它心情好掉一个。</div>') +
      '<h4>🏪 商城</h4>' +
      CATS.map(function (c) {
        var list = allProps().filter(function (p) { return p.cat === c[0]; });
        if (!list.length) return '';
        return '<div class="gf-note" style="margin-top:2px"><b style="color:#fff">' + esc(c[0]) + '</b>' + (c[1] ? ' · ' + esc(c[1]) : '') + '</div>' +
          list.map(function (p) {
            var can = state.pts >= p.price;
            return '<div class="gf-item"><span class="e">' + p.emoji + '</span><div class="n"><b>' + esc(p.name) + '</b><span>' + esc(p.desc) + '</span></div><span class="p">' + p.price + '</span><button class="gf-btn ghost gf-buy" data-id="' + esc(p.id) + '"' + (can ? '' : ' disabled') + '>买</button></div>';
          }).join('');
      }).join('') +
      '<div class="gf-note">光环 / 才艺 / 世界类＝用的那一刻塞给下一轮正文一条幕后指令，用完自动撤。嘴替类＝它替你写一句填进输入框。感知类＝它自己看，不动正文。时光回溯＝帮你按一下最后一层的 swipe。「现编」是 Asu-02 按这张卡自己想的，每个聊天不一样。</div>';
    s.querySelector('.gf-bag-x').addEventListener('click', function () { toggleOverlay('bag', false); });
    s.querySelectorAll('.gf-use').forEach(function (b) { b.addEventListener('click', function () { useProp(this.getAttribute('data-id')); }); });
    s.querySelectorAll('.gf-buy').forEach(function (b) { b.addEventListener('click', function () { buyProp(this.getAttribute('data-id')); }); });
  }
  function buyProp(id) {
    var p = propOf(id); if (!p) return;
    if (state.pts < p.price) { toast('积分不够，差 ' + (p.price - state.pts), 'warn'); return; }
    state.pts -= p.price; giveProp(id, 1);
    pushLog({ who: 'sys', cls: 'drop', text: '花 ' + p.price + ' 积分买了 ' + p.emoji + ' ' + p.name, ts: Date.now() });
    renderAll(); renderBag(); toast(p.emoji + ' 到手', 'ok');
  }

  function renderSettings() {
    var s = DOC.querySelector('#' + NS + '-panel .gf-set'); if (!s) return;
    var ownCfg = readCfg(API_KEY_LS) || {};
    s.innerHTML =
      '<h4>设置 <button class="gf-ib gf-set-x">✕</button></h4>' +
      '<label>自动播报 <button class="gf-pill gf-set-auto ' + (settings.auto ? 'on' : '') + '">' + (settings.auto ? '开' : '关') + '</button></label>' +
      '<label>每几层一次 <span class="gf-step"><button class="gf-pill gf-set-nm">−</button><b class="gf-set-nv">' + settings.everyN + '</b><button class="gf-pill gf-set-np">＋</button></span></label>' +
      '<div class="gf-note">开着的话正文每出来 N 回合它就播报一次、给两条走向。每次多一个 LLM 调用（用下面选的 API，不走你的预设）。</div>' +
      '<label>球上冒气泡 <button class="gf-pill gf-set-bubble ' + (settings.bubble ? 'on' : '') + '">' + (settings.bubble ? '开' : '关') + '</button></label>' +
      '<label>球的大小 <span class="gf-row">' + [['s', '小'], ['m', '中'], ['l', '大']].map(function (o) { return '<button class="gf-pill gf-set-size ' + (settings.ballSize === o[0] ? 'on' : '') + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</span></label>' +
      '<label>球贴边半藏（手机） <button class="gf-pill gf-set-snap ' + (settings.snap ? 'on' : '') + '">' + (settings.snap ? '开' : '关') + '</button></label>' +
      '<div class="gf-note">只在手机上生效：球靠着屏幕左右边几秒没人碰，就半藏进边里变半透明，不占地方；点它、冒气泡、开窗都会出来。电脑上不贴。</div>' +
      '<label>点「采纳」之后 <span class="gf-row">' +
        '<button class="gf-pill gf-set-adopt ' + (settings.adoptMode !== 'input' ? 'on' : '') + '" data-mode="inject">悄悄注入下一轮</button>' +
        '<button class="gf-pill gf-set-adopt ' + (settings.adoptMode === 'input' ? 'on' : '') + '" data-mode="input">填进输入框</button>' +
      '</span></label>' +
      '<h4>它用哪个 API 说话</h4>' +
      (function () {
        var A = activeApi();
        var note = A.from === 'own' ? '✅ 正在用 Asu-02 自己填的独立 API（' + esc(A.cfg.model || '?') + '）'
                 : A.from === 'tanuki' ? '✅ 正在用小狸 Live 填的那套 API（' + esc(A.cfg.model || '?') + '），不用再填'
                 : A.from === 'sb' ? '✅ 正在用 Sugar Baby 手机里填的那套 API（' + esc(A.cfg.model || '?') + '），不用再填'
                 : '⚠ 没有独立 API，走酒馆当前连接（会经过酒馆管线：记忆插件可能塞标签、反代认证可能不过）';
        return '<div class="gf-note">' + note + '</div>';
      })() +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<input type="text" class="gf-api-url" placeholder="API 地址（OpenAI 兼容），比如 https://api.xxx.com/v1" value="' + esc(ownCfg.url || '') + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore>' +
        '<input type="text" class="gf-api-key gf-mask" placeholder="API Key（只存这台浏览器本地）" value="' + esc(ownCfg.key || '') + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" readonly data-lpignore="true" data-1p-ignore data-form-type="other">' +
        '<div class="gf-row"><button class="gf-btn ghost gf-api-fetch">🔄 拉取模型</button><button class="gf-btn gf-api-save">💾 保存</button><button class="gf-btn ghost gf-api-clear">🗑 清除</button></div>' +
        '<select class="gf-api-model" style="display:' + (ownCfg.model ? 'block' : 'none') + ';width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:9px;padding:8px 10px;font:inherit">' + (ownCfg.model ? '<option value="' + esc(ownCfg.model) + '" selected>' + esc(ownCfg.model) + '</option>' : '') + '</select>' +
        '<div class="gf-note">拉取＝连通性测试，从列表里选一个再保存。播报和走向都是嘴碎的活，便宜模型就行。</div>' +
      '</div>' +
      '<h4>数据</h4>' +
      '<div class="gf-row"><button class="gf-btn ghost gf-set-unbind">解绑（清掉这个聊天里的账本：积分、背包、签到、现编道具）</button><button class="gf-btn ghost gf-set-resetpos">小窗和球回默认位置</button></div>' +
      '<div class="gf-note">v' + VERSION + ' · Asu-02 · 它只在你脑子里，正文看不见它；只有你用的道具和点了「采纳」的走向会进下一轮。</div>';
    s.querySelector('.gf-set-x').addEventListener('click', function () { toggleOverlay('set', false); });
    s.querySelector('.gf-set-auto').addEventListener('click', function () { settings.auto = !settings.auto; saveSettings(); renderSettings(); renderHead(); });
    s.querySelector('.gf-set-bubble').addEventListener('click', function () { settings.bubble = !settings.bubble; saveSettings(); if (!settings.bubble) hideBubble(); renderSettings(); });
    s.querySelector('.gf-set-snap').addEventListener('click', function () { settings.snap = !settings.snap; saveSettings(); if (!settings.snap) unsnap(); else snapSoon(500); renderSettings(); });
    s.querySelectorAll('.gf-set-size').forEach(function (b) { b.addEventListener('click', function () { settings.ballSize = this.getAttribute('data-v'); saveSettings(); placeBall(); renderSettings(); }); });
    s.querySelectorAll('.gf-set-adopt').forEach(function (b) { b.addEventListener('click', function () { settings.adoptMode = this.getAttribute('data-mode') === 'input' ? 'input' : 'inject'; saveSettings(); renderSettings(); }); });
    function stepN(d) { var n = Math.min(20, Math.max(1, (settings.everyN || 1) + d)); if (n === settings.everyN) return; settings.everyN = n; saveSettings(); s.querySelector('.gf-set-nv').textContent = n; }
    s.querySelector('.gf-set-nm').addEventListener('click', function () { stepN(-1); });
    s.querySelector('.gf-set-np').addEventListener('click', function () { stepN(1); });
    s.querySelector('.gf-set-unbind').addEventListener('click', function () {
      if (!VIEW.confirm('确定解绑？这个聊天里的积分、背包、签到、现编道具全清，重新绑定从零开始。')) return;
      try { uninjectPrompts([ADOPT_ID, PROP_ID]); } catch (e) {}
      state = blankState(); saveState(); toggleOverlay('set', false); renderAll(); toast('解绑了。下一回合它会重新叮一声', 'warn');
    });
    s.querySelector('.gf-set-resetpos').addEventListener('click', function () { settings.pos = null; settings.panelPos = null; saveSettings(); placeBall(); placePanel(); toast('回去了', 'ok'); });
    var kIn = s.querySelector('.gf-api-key'); if (kIn) kIn.addEventListener('focus', function () { kIn.removeAttribute('readonly'); });
    s.querySelector('.gf-api-fetch').addEventListener('click', async function () {
      var btn = this, u = s.querySelector('.gf-api-url').value.trim(), k = s.querySelector('.gf-api-key').value.trim();
      if (!u || !k) { toast('先填地址和 Key', 'warn'); return; }
      btn.textContent = '⏳ 拉取中…'; btn.disabled = true;
      try {
        var resp = await fetch(modelsUrlOf(u), { headers: { 'Authorization': 'Bearer ' + k } });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var j = await resp.json();
        var ids = (j.data || j.models || []).map(function (m) { return (m && (m.id || m.name)) || m; }).filter(function (x) { return typeof x === 'string'; });
        if (!ids.length) throw new Error('返回里没有模型列表');
        var sel = s.querySelector('.gf-api-model'); var cur = sel.value;
        sel.innerHTML = ids.map(function (id) { return '<option value="' + esc(id) + '"' + (id === cur ? ' selected' : '') + '>' + esc(id) + '</option>'; }).join('');
        sel.style.display = 'block';
        toast('📡 拉到 ' + ids.length + ' 个模型，选一个再保存', 'ok');
        btn.textContent = '🔄 拉取模型 (' + ids.length + ')';
      } catch (e) {
        toast('拉取失败: ' + ((e && e.message) || e) + '。多半是地址不对 / Key 无效 / 不允许浏览器直连(CORS)', 'error');
        btn.textContent = '🔄 拉取模型';
      }
      btn.disabled = false;
    });
    s.querySelector('.gf-api-save').addEventListener('click', function () {
      var u = s.querySelector('.gf-api-url').value.trim(), k = s.querySelector('.gf-api-key').value.trim(), m = s.querySelector('.gf-api-model').value;
      if (!u || !k) { toast('地址和 Key 都要填', 'warn'); return; }
      if (!m) { toast('先拉取模型再选一个', 'warn'); return; }
      try { VIEW.localStorage.setItem(API_KEY_LS, JSON.stringify({ url: u, key: k, model: m })); } catch (e) { toast('保存失败: ' + e.message, 'error'); return; }
      toast('存好了', 'ok'); renderSettings();
    });
    s.querySelector('.gf-api-clear').addEventListener('click', function () {
      try { VIEW.localStorage.removeItem(API_KEY_LS); } catch (e) {}
      toast('清了，回落到下一顺位的 API', 'warn'); renderSettings();
    });
  }

  /* ================================================================
     它看得到的东西：上下文采集（和小狸一样）
     ================================================================ */
  var activatedEntries = [];
  function stripJunk(s) {
    return String(s || '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/```[a-z]*\n[\s\S]*?```/gi, '[代码块]')
      .replace(/<[^>]{1,200}>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function safeJson(obj, max) {
    try {
      var s = JSON.stringify(obj, function (k, v) {
        if (typeof v === 'string' && v.length > 300) return v.slice(0, 120) + '…(' + v.length + '字)';
        if (typeof v === 'string' && /^data:image/i.test(v)) return '[图片]';
        return v;
      });
      return s.length > max ? s.slice(0, max) + '…' : s;
    } catch (e) { return ''; }
  }
  function curFloor() { try { return typeof getLastMessageId === 'function' ? getLastMessageId() : -1; } catch (e) { return -1; } }
  function userName() {
    try { var c = VIEW.SillyTavern && VIEW.SillyTavern.getContext ? VIEW.SillyTavern.getContext() : null; if (c && c.name1) return String(c.name1); } catch (e) {}
    try { var pe = getPersona('current'); if (pe && pe.name) return String(pe.name); } catch (e) {}
    return '{{user}}';
  }
  async function gatherContext(nFloors) {
    var ctx = { charName: '', charDesc: '', persona: '', floors: 0, recent: [], vars: '', wbActivated: [] };
    try { ctx.charName = (typeof getCurrentCharacterName === 'function' && getCurrentCharacterName()) || ''; } catch (e) {}
    try {
      if (typeof getCharacter === 'function') {
        var ch = await getCharacter('current');
        if (ch) { ctx.charName = ctx.charName || ch.name || ''; ctx.charDesc = stripJunk(ch.description || '').slice(0, 1800); }
      }
    } catch (e) {}
    try { if (typeof getPersona === 'function') { var pe = getPersona('current'); if (pe) ctx.persona = ((pe.name || '') + '：' + stripJunk(pe.description || '')).slice(0, 600); } } catch (e) {}
    try {
      var last = curFloor();
      ctx.floors = last + 1;
      if (last >= 0 && typeof getChatMessages === 'function') {
        var from = Math.max(0, last - nFloors + 1);
        var msgs = getChatMessages(from + '-' + last, { hide_state: 'unhidden' }) || [];
        ctx.recent = msgs.map(function (m) {
          return { id: m.message_id, who: m.role === 'user' ? '<user>' : (m.name || '正文'), text: stripJunk(m.message).slice(0, 1400) };
        });
      }
    } catch (e) {}
    try {
      var v = getVariables({ type: 'chat' }) || {};
      var vv = {}; for (var k in v) { if (k === STATE_KEY || k === 'tanuki_live') continue; vv[k] = v[k]; }
      if (vv.stat_data) ctx.vars = safeJson(vv.stat_data, 1400);
      else ctx.vars = safeJson(vv, 1000);
    } catch (e) {}
    ctx.wbActivated = activatedEntries.slice(-10).map(function (e) {
      return { name: e.comment || e.name || (e.key && e.key.join ? e.key.join(',') : ''), text: stripJunk(e.content || '').slice(0, 200) };
    });
    return ctx;
  }
  function contextBlock(ctx) {
    var L = [];
    L.push('【<host>正在玩的这张卡】');
    L.push('角色：' + (ctx.charName || '(未知)') + (ctx.charDesc ? '\n' + ctx.charDesc : ''));
    if (ctx.persona) L.push('<host>（也就是<user>）的 persona：' + ctx.persona);
    L.push('已聊到第 ' + ctx.floors + ' 层');
    if (ctx.wbActivated.length) L.push('本轮触发的世界书条目：\n' + ctx.wbActivated.map(function (e) { return '- ' + e.name + (e.text ? '：' + e.text : ''); }).join('\n'));
    if (ctx.vars) L.push('聊天变量（当前状态）：' + ctx.vars);
    if (ctx.recent.length) L.push('【最近几层正文（旧→新）】\n' + ctx.recent.map(function (m) { return '—— 第 ' + m.id + ' 层 · ' + m.who + ' ——\n' + m.text; }).join('\n\n'));
    return L.join('\n\n');
  }
  function stateBlock(extra) {
    var L = ['【你的账本】'];
    L.push('你叫<user>：' + state.host + ' · 积分：' + state.pts + ' · <host>跟上过你的走向 ' + state.followed + ' 次 · 签到 ' + state.signed + ' 天');
    L.push('上次签到的剧情日期：' + (state.date || '（还没签过）'));
    if (state.paths && state.paths.length) L.push('你上一回合给的走向：\n' + state.paths.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n'));
    else L.push('上一回合没给走向。');
    var bag = allProps().filter(function (p) { return bagCount(p.id) > 0; }).map(function (p) { return p.name + '×' + bagCount(p.id); });
    L.push('背包：' + (bag.length ? bag.join('、') : '空'));
    if (state.lastUse) L.push('上一轮<host>用了道具：' + state.lastUse);
    if (state.double) L.push('双倍积分卡生效中：下一次跟上走向奖励翻倍');
    if (state.custom && state.custom.length) L.push('你已经现编过的道具（' + state.custom.length + '/' + CUSTOM_MAX + '）：' + state.custom.map(function (p) { return p.name; }).join('、'));
    if (extra) L.push(extra);
    return L.join('\n');
  }

  /* ================================================================
     提示词
     ================================================================ */
  var HUMOR = [
    '【你的笑点从哪来】黑色幽默，两个来源：一是把正文里刚发生的真事冷静地翻译成系统世界的事件——成就解锁、bug 上报、版本公告、风控预警、用户协议第几条；二是用最平的语气说最不平的判断。笑点落在局面和卡里的人身上，永远不落在<host>身上。细节必须是正文里真有的（人名、东西、那句话），不许自己编事件。翻译本身就是笑话，不用再加感叹号或哈哈，不用解释笑点。',
    '【你是什么】你是<host>脑子里的系统，只有<host>听得见你。卡里的人不知道你存在，正文也不知道。你直接对<host>说话。不管这张卡是宫斗、修仙、办公室还是今天早上吃什么的日常，你都把它当成一个可以通关的游戏来运营——日常卡就是人生模拟器，走向从眼前的处境里长出来，不硬塞玄幻。',
    '【攻略性质】你的核心职能是带<host>通关。每回合给两条走向：两条是真的不同的路（一条稳一条险、或者一条对人一条对事），每条落到一件具体的事——对谁、做什么、说什么，必须用正文里真实出现的人和东西，不出「保持自信」「多观察」这种空话。走不走随<host>，跟着走了总部会加分，你不用提分。',
    '【绝不】不替正文写正文，不扮演卡里的角色说台词，不复述剧情，不用 markdown，不加「作为 AI」之类的话。下面对话记录里有你自己之前说过的话：用过的比喻、梗、句式这一轮就换新的。'
  ].join('\n');

  var TURN_FORMAT = [
    '【输出格式，严格照抄，每行一个字段，没有内容的字段整行不要】',
    '播报：一到三句，你的声线。可以分成两行「播报：」。',
    '走向：第一条走向（≤40字，对谁、做什么或说什么）',
    '走向：第二条走向（≤40字，和第一条是真的不同的路）',
    '跟上：1 或 2 或 无 ｜ 依据：正文原话（≤30字）',
    '日期：剧情里现在是什么日子（≤12字：几月几日 / 第几天 / 某某节 / 星期几，正文或变量里看得出来就写，看不出来写 无）',
    '新道具：名字 ｜ 一个emoji ｜ 类型 ｜ 价格 ｜ 效果',
    '',
    '【跟上怎么判】',
    '- 看你上一回合给的两条走向，最新一层正文里<host>是不是走了其中一条（做了那件事、说了那类话、找了那个人）。走了写编号并引用正文原话当依据；没走或者上一回合没给走向就写 无。',
    '- 只看正文。<host>在这个窗口里嘴上说「我走了」不算。',
    '【日期怎么判】',
    '- 剧情日期以正文和变量为准，不是现实日期。同一天就照抄上次签到的那个写法，别换说法（换了说法总部会当成新的一天）。',
    '【现编道具规则】',
    '- 你现编过的道具少于 ' + CUSTOM_MAX + ' 个时，每四五轮可以现编一个贴这张卡的道具（不是每轮）。名字 ≤6 字、要有这张卡的味道；类型三选一：注入 / 嘴替 / 感知；价格 10–60。',
    '- 效果写法：注入＝写成给正文的一句幕后指令（这一幕发生什么、谁怎么反应），提到<host>时一律写「玩家」两个字；嘴替＝写成给你自己的一句任务（替玩家写一句什么样的话）；感知＝写成给你自己的一句任务（看什么、列什么）。',
    '【长度】播报 ≤ 90 字。<host>直接问你问题时可以到 200 字，但仍然是说话不是写文；被问的时候走向可以不给。'
  ].join('\n');

  var BIND_FORMAT = [
    '【现在是绑定时刻】你刚刚绑定到<host>身上，读完了上面这张卡。按你的声线做这几件事，严格按下面格式输出，每行一个字段：',
    '称呼：你打算怎么叫<host>（默认「宿主」，贴题材可以换：小主/玩家/用户/学员……只要一个词）',
    '开场：绑定台词，两到四句，你的声线。报自己的名字 Asu-02，提到这张卡里具体的人或处境，说一句你对这个开局的判断。别提你的头像。可以分几行「开场：」。',
    '走向：第一条走向（≤40字，对谁、做什么或说什么）',
    '走向：第二条走向（≤40字，和第一条是真的不同的路）',
    '日期：剧情里现在是什么日子（≤12字，看不出来写 无）',
    '新道具：名字 ｜ 一个emoji ｜ 类型 ｜ 价格 ｜ 效果',
    '新道具：名字 ｜ 一个emoji ｜ 类型 ｜ 价格 ｜ 效果',
    '两个新道具是这张卡专属的（宫斗卡就是宫里的东西，办公室卡就是办公室的），类型三选一：注入 / 嘴替 / 感知，价格 10–60。效果写法：注入＝给正文的一句幕后指令（提到<host>时写「玩家」两个字）；嘴替＝替玩家写一句什么样的话；感知＝看什么、列什么。'
  ].join('\n');

  function fillHost(s) { return String(s).split('<host>').join(state.host || '宿主'); }

  /* ================================================================
     生成
     ================================================================ */
  var busy = false, lastAutoKey = '', autoCounter = 0, pendingAuto = false;
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function cleanReply(t) {
    t = String(t || '');
    t = t.replace(/<!--[\s\S]*?-->/g, '');
    for (var i = 0; i < 4; i++) t = t.replace(/<([A-Za-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/g, '');
    t = t.replace(/<\/?[A-Za-z][\w-]*(?:\s[^>]*)?\/?>/g, '');
    t = t.replace(/^```[a-z]*\s*\n?|\n?```\s*$/g, '');
    return t.replace(/\n{3,}/g, '\n\n').trim();
  }
  async function llm(prompts, uin) {
    var A = activeApi();
    var reply;
    if (A.cfg) reply = await callIndependent(A.cfg, prompts.concat([{ role: 'user', content: uin }]));
    else {
      if (typeof generateRaw !== 'function') throw new Error('generateRaw 不可用，酒馆助手版本太老？');
      reply = await generateRaw({ user_input: uin, ordered_prompts: prompts.concat(['user_input']), should_silence: true, should_stream: false, max_chat_history: 0, generation_id: NS + '_' + Date.now() });
    }
    var text = cleanReply(typeof reply === 'string' ? reply : (reply && reply.content) || '');
    if (!text) throw new Error('空回复');
    return text;
  }
  function basePrompts(ctx, formatBlock, extraState) {
    var v = currentVoice();
    var hist = state.log.filter(function (m) { return m.who === 'me' || m.who === 'them'; }).slice(-8).map(function (m) {
      var hs = m.hints || (m.hint ? [m.hint] : []);
      return { role: m.who === 'me' ? 'user' : 'assistant', content: m.who === 'them' ? ('播报：' + m.text + hs.map(function (h) { return '\n走向：' + h; }).join('')) : m.text };
    });
    return [
      { role: 'system', content: fillHost('【你是谁】\n' + v.voice + '\n\n' + HUMOR) },
      { role: 'system', content: fillHost(contextBlock(ctx)) },
      { role: 'system', content: fillHost(stateBlock(extraState)) },
      { role: 'system', content: fillHost(formatBlock) }
    ].concat(hist);
  }
  function apiHint(msg) {
    if (/unauthorized|401|403|api key|forbidden/i.test(msg)) msg += '（认证没过 → 去 ⚙ 填一个独立 API）';
    return msg;
  }

  // 解析：按行前缀
  function cleanDate(s) { s = String(s || '').replace(/[「」『』"']/g, '').trim(); if (!s || /^(无|未知|不明|看不出|不详)/.test(s)) return ''; return s.slice(0, 14); }
  function parseTurn(text) {
    var out = { say: [], hints: [], follow: 0, why: '', date: '', props: [] };
    String(text).split(/\r?\n/).forEach(function (l) {
      l = l.trim(); if (!l) return;
      var m;
      if ((m = l.match(/^新道具[:：]\s*(.+)$/))) { var pr = parseProp(m[1]); if (pr) out.props.push(pr); return; }
      if ((m = l.match(/^(?:系统)?播报[:：]\s*(.*)$/))) { if (m[1]) out.say.push(m[1]); return; }
      if ((m = l.match(/^(?:走向|提示|攻略)\s*[一二三1-3]?[:：]\s*(.*)$/))) { var h = m[1].replace(/^[💡🧭]\s*/, '').trim(); if (h && out.hints.length < 2) out.hints.push(h); return; }
      if ((m = l.match(/^跟上[:：]\s*(?:走向)?\s*([12无没否])\s*(?:[|｜]\s*(?:依据[:：]\s*)?(.*))?$/))) { out.follow = /[12]/.test(m[1]) ? +m[1] : 0; out.why = (m[2] || '').trim(); return; }
      if ((m = l.match(/^日期[:：]\s*(.*)$/))) { out.date = cleanDate(m[1]); return; }
      if (/^(?:系统名|称呼|开场|主线|支线|判定|新任务)[:：]/.test(l)) return;
      if (out.say.length) out.say[out.say.length - 1] += '\n' + l; else out.say.push(l);
    });
    return out;
  }
  function parseBind(text) {
    var out = { host: '', open: [], hints: [], date: '', props: [] };
    String(text).split(/\r?\n/).forEach(function (l) {
      l = l.trim(); if (!l) return;
      var m;
      if ((m = l.match(/^新道具[:：]\s*(.+)$/))) { var pr = parseProp(m[1]); if (pr) out.props.push(pr); return; }
      if ((m = l.match(/^称呼[:：]\s*(.+)$/))) { out.host = m[1].replace(/[「」『』"']/g, '').trim().slice(0, 6); return; }
      if ((m = l.match(/^开场[:：]\s*(.*)$/))) { if (m[1]) out.open.push(m[1]); return; }
      if ((m = l.match(/^(?:走向|提示)\s*[一二三1-3]?[:：]\s*(.*)$/))) { var h = m[1].replace(/^[💡🧭]\s*/, '').trim(); if (h && out.hints.length < 2) out.hints.push(h); return; }
      if ((m = l.match(/^日期[:：]\s*(.*)$/))) { out.date = cleanDate(m[1]); return; }
      if (/^(?:系统名|主线|支线|跟上)[:：]/.test(l)) return;
      if (out.open.length) out.open[out.open.length - 1] += '\n' + l; else out.open.push(l);
    });
    return out;
  }
  // 现编道具：名字 ｜ emoji ｜ 类型 ｜ 价格 ｜ 效果
  function parseProp(line) {
    var f = String(line).split(/\s*[|｜]\s*/);
    if (f.length < 5) return null;
    var kind = /注入/.test(f[2]) ? 'inject' : /嘴替|台词/.test(f[2]) ? 'line' : /感知|探测|扫描/.test(f[2]) ? 'scan' : '';
    if (!kind) return null;
    var price = parseInt((f[3].match(/\d+/) || ['20'])[0], 10);
    var eff = f.slice(4).join(' ').trim();
    if (!f[0].trim() || !eff) return null;
    return { name: f[0].replace(/[「」『』"']/g, '').trim().slice(0, 8), emoji: (f[1].trim() || '🧪').slice(0, 4), kind: kind, price: Math.max(10, Math.min(60, price || 20)), eff: eff.slice(0, 160) };
  }
  function addCustomProp(o) {
    if (!o || (state.custom || []).length >= CUSTOM_MAX) return null;
    if (state.custom.some(function (p) { return p.name === o.name; })) return null;
    state.seq = (state.seq || 0) + 1;
    var p = { id: 'x' + state.seq, cat: '现编', name: o.name, emoji: o.emoji, price: o.price, kind: o.kind, desc: o.eff.slice(0, 40) + (o.eff.length > 40 ? '…' : ''), custom: true };
    if (o.kind === 'inject') p.text = o.eff.split('玩家').join('<name>');
    else p.job = o.eff.split('玩家').join('<host>');
    state.custom.push(p);
    pushLog({ who: 'sys', cls: 'drop', text: '🧪 Asu-02 现编了个道具：' + p.emoji + ' ' + p.name + '（' + p.price + ' 分，商城里）', ts: Date.now() });
    return p;
  }
  // 结账：跟上走向 / 签到
  function settleFollow(n, why) {
    if (!n || !state.paths || !state.paths[n - 1]) return false;
    var got = state.double ? FOLLOW_PTS * 2 : FOLLOW_PTS;
    state.pts += got; state.followed++;
    pushLog({ who: 'sys', cls: 'good', text: '🧭 跟上了走向：' + state.paths[n - 1] + '　+' + got + (state.double ? '（✨ 双倍）' : '') + (why ? '　（' + why + '）' : ''), ts: Date.now() });
    state.double = false;
    return true;
  }
  function settleDate(d) {
    if (!d || d === state.date) return false;
    var first = !state.date;
    state.date = d; state.pts += SIGN_PTS; state.signed++;
    pushLog({ who: 'sys', cls: 'good', text: '📅 ' + d + '　签到 +' + SIGN_PTS + (first ? '　（剧情日期换了就自动签）' : ''), ts: Date.now() });
    return true;
  }
  function rollDrop(force) {
    if (!force && Math.random() > DROP_RATE) return null;
    var pool = allProps().filter(function (p) { return p.price <= 40; });
    var p = pool[Math.floor(Math.random() * pool.length)];
    giveProp(p.id, 1);
    pushLog({ who: 'sys', cls: 'drop', text: '🎁 掉落：' + p.emoji + ' ' + p.name + '　（背包里，点 🎒 用）', ts: Date.now() });
    return p;
  }
  async function emit(chunks, hints, floor, trigger) {
    for (var ci = 0; ci < chunks.length; ci++) {
      if (ci > 0) await sleep(Math.min(1800, 500 + chunks[ci].length * 40));
      var entry = { who: 'them', pname: sysName(), text: chunks[ci], floor: floor >= 0 ? floor : null, trigger: trigger, ts: Date.now() };
      if (ci === chunks.length - 1 && hints && hints.length) entry.hints = hints.slice(0, 2);
      pushLog(entry);
      renderBody(); scrollBottom();
      if (!isOpen()) { setUnread(unread + 1); showBubble(sysName(), chunks[ci]); }
    }
  }

  // 绑定：第一次
  async function bindNow() {
    if (busy) { toast('它还在忙', 'warn'); return; }
    if (state.bound) return;
    busy = true; setBusy(true);
    var floor = curFloor();
    try {
      var ctx = await gatherContext(4);
      var prompts = basePrompts(ctx, BIND_FORMAT);
      var text = await llm(prompts, '（绑定开始。读卡，定称呼，开场，给两条走向，看一眼剧情日期，现编两个这张卡专属的道具。）');
      var b = parseBind(text);
      state.bound = true;
      state.sysName = SYS_NAME;
      if (b.host) state.host = b.host;
      saveState();
      pushLog({ who: 'sys', text: '叮——绑定成功。' + state.sysName + ' 已上线，称你「' + state.host + '」。', ts: Date.now() });
      var open = b.open.length ? b.open : ['绑定成功。'];
      await emit(open, b.hints, floor, 'bind');
      state.paths = b.hints.slice(0, 2);
      settleDate(b.date);
      b.props.slice(0, 2).forEach(addCustomProp);
      STARTER.forEach(function (id) { giveProp(id, 1); });
      pushLog({ who: 'sys', cls: 'drop', text: '🎁 新手礼包：' + STARTER.map(function (id) { var p = propOf(id); return p.emoji + ' ' + p.name; }).join('、') + '　（点 🎒 看）', ts: Date.now() });
      saveState(); renderAll(); scrollBottom();
      if (!isOpen()) { setUnread(unread + 1); showBubble(state.sysName, '叮——绑定成功。'); }
    } catch (e) {
      toast('🦁绑定失败：' + apiHint((e && e.message) || String(e)).slice(0, 120), 'error');
      console.warn('[Asu-02] 绑定失败', e);
    } finally { busy = false; setBusy(false); }
  }

  // 每回合 / 被戳 / 被问
  async function turn(userLine, trigger) {
    if (busy) { toast('它还在处理上一条', 'warn'); return; }
    if (!state.bound) { await bindNow(); return; }
    busy = true; setBusy(true);
    var floor = curFloor();
    try {
      var drop = trigger === 'auto' ? rollDrop() : null;
      if (drop) renderAll();
      var extra = [];
      if (drop) extra.push('本轮总部随机掉落了道具「' + drop.name + '」给<host>（已经进背包），播报里顺嘴提一句，别解释怎么用');
      var ctx = await gatherContext(6);
      var prompts = basePrompts(ctx, TURN_FORMAT, extra.join('\n'));
      var uin = userLine ? userLine
        : (trigger === 'poke' ? '（<host>戳了你一下：现在播报，给两条走向。）'
          : '（正文刚出来一回合。看最新那层：判一下<host>有没有跟上你上次的走向，播报，给两条新走向，报剧情日期。）');
      var text = await llm(prompts, uin);
      var r = parseTurn(text);
      state.lastUse = '';
      if (!r.say.length) r.say = [text.slice(0, 200)];
      await emit(r.say.slice(0, 3), r.hints, floor, trigger);   // 先说话，再结账（账目行排在播报后面）
      var changed = false;
      if (trigger !== 'ask') {   // 宿主嘴上说的不算，只有看正文的回合才结账
        if (settleFollow(r.follow, r.why)) changed = true;
        if (settleDate(r.date)) changed = true;
        if (r.hints.length) state.paths = r.hints.slice(0, 2);
        if (r.props.length && addCustomProp(r.props[0])) changed = true;
      }
      saveState();
      if (changed) { renderAll(); scrollBottom(); }
    } catch (e) {
      toast('🦁系统掉线：' + apiHint((e && e.message) || String(e)).slice(0, 120), 'error');
      console.warn('[Asu-02] 生成失败', e);
    } finally {
      busy = false; setBusy(false);
      if (pendingAuto) { pendingAuto = false; if (settings.auto) setTimeout(function () { if (!busy) turn('', 'auto'); }, 600); }
    }
  }
  function ask(text) {
    pushLog({ who: 'me', text: text, ts: Date.now() });
    renderBody(); scrollBottom();
    turn(text, 'ask');
  }

  /* ================================================================
     采纳走向 / 用道具 → 进主线
     ================================================================ */
  var ADOPT_ID = NS + '-adopt';
  var PROP_ID = NS + '-prop';
  function fillInput(s) {
    var ta = DOC.getElementById('send_textarea');
    if (!ta) { toast('找不到酒馆输入框', 'error'); return false; }
    ta.value = (ta.value && ta.value.trim()) ? ta.value.replace(/\s+$/, '') + '\n' + s : s;
    ta.dispatchEvent(new VIEW.Event('input', { bubbles: true }));
    ta.focus();
    if (isNarrow()) setOpen(false);
    return true;
  }
  function adopt(logIdx, k, btn) {
    var m = state.log[logIdx]; if (!m) return;
    var hs = m.hints || (m.hint ? [m.hint] : []);
    var s = hs[k]; if (!s) return;
    try {
      if (settings.adoptMode === 'input') {
        if (!fillInput(s)) return;
        toast('🧭 填进输入框了，改改再发', 'ok');
      } else {
        uninjectPrompts([ADOPT_ID]);
        injectPrompts([{ id: ADOPT_ID, position: 'in_chat', depth: 0, role: 'system', content: '[幕后提示（来自玩家，不要复述、不要提及本段本身）：接下来的剧情请自然地朝这个方向推进——' + s + ']', should_scan: false }], { once: true });
        toast('🧭 塞进下一轮了：' + s.slice(0, 30), 'ok');
      }
      m.adopted = m.adopted || {}; m.adopted[k] = true;
      if (btn) { btn.disabled = true; btn.textContent = '已采纳'; }
      pushLog({ who: 'sys', text: '采纳了走向：' + s, ts: Date.now() });
      renderBody(); scrollBottom();
    } catch (e) { toast('采纳失败：' + (e.message || e), 'error'); }
  }
  async function useProp(id) {
    var p = propOf(id); if (!p) return;
    if (bagCount(id) <= 0) { toast('没有这个道具', 'warn'); return; }
    if (!state.bound) { toast('先绑定', 'warn'); return; }
    var name = userName();
    try {
      if (p.kind === 'inject') {
        uninjectPrompts([PROP_ID]);
        injectPrompts([{ id: PROP_ID, position: 'in_chat', depth: 0, role: 'system', content: '[幕后指令（来自剧情系统，不要复述、不要提及本段本身）：' + p.text.split('<name>').join(name) + ']', should_scan: false }], { once: true });
        consume(p, '已塞进下一轮，发一条消息就生效');
        toggleOverlay('bag', false);
      } else if (p.kind === 'redo') {
        var mes = DOC.querySelector('#chat .mes:last-child');
        var isUser = mes && mes.getAttribute('is_user') === 'true';
        var sw = mes && !isUser ? mes.querySelector('.swipe_right') : null;
        if (!sw) { toast('最后一层不是 AI 的，回溯不了', 'warn'); return; }
        consume(p, '时间回溯中');
        toggleOverlay('bag', false); setOpen(false);
        sw.click();
      } else if (p.kind === 'fx') {
        if (p.fx === 'double') { state.double = true; consume(p, '下一次跟上走向双倍'); }
        else if (p.fx === 'lucky') { consume(p, ''); var got = rollDrop(true); toast('🎰 ' + (got ? got.emoji + ' ' + got.name : '空'), 'ok'); }
        else if (p.fx === 'resign') {
          if (!state.date) { toast('还不知道剧情日期，等它报一次再用', 'warn'); return; }
          consume(p, ''); state.pts += SIGN_PTS; state.signed++;
          pushLog({ who: 'sys', cls: 'good', text: '📅 补签 ' + state.date + '　+' + SIGN_PTS, ts: Date.now() });
          toast('📅 补签 +' + SIGN_PTS, 'ok');
        }
        renderAll(); renderBag();
      } else if (p.kind === 'line' || p.kind === 'scan') {
        if (busy) { toast('它还在忙', 'warn'); return; }
        busy = true; setBusy(true);
        toggleOverlay('bag', false);
        try {
          var ctx = await gatherContext(6);
          var v = currentVoice();
          var job = p.kind === 'line'
            ? '【' + p.name + '】' + (p.job || '') + ' 只输出那一句话本身：第一人称、是<host>要原样说出口的话、≤60字、不带引号、不带任何解释和前缀。'
            : '【' + p.name + '】用你的声线，' + (p.job || '') + ' ≤160字，纯文本，不用格式字段。';
          var prompts = [
            { role: 'system', content: fillHost('【你是谁】\n' + v.voice + '\n\n' + HUMOR) },
            { role: 'system', content: fillHost(contextBlock(ctx)) },
            { role: 'system', content: fillHost(stateBlock()) },
            { role: 'system', content: fillHost(job) }
          ];
          var text = await llm(prompts, '（<host>用了 ' + p.name + '。）');
          consume(p, '');
          if (p.kind === 'line') {
            var line = text.split(/\r?\n/)[0].replace(/^(?:播报|台词|提示|走向)[:：]\s*/, '').replace(/^["“「『]|["”」』]$/g, '').trim();
            if (fillInput(line)) toast(p.emoji + ' 填进输入框了，改改再发', 'ok');
            pushLog({ who: 'sys', text: p.emoji + ' ' + p.name + '：' + line, ts: Date.now() });
          } else {
            await emit([text], [], curFloor(), 'prop');
          }
          renderAll(); scrollBottom();
        } finally { busy = false; setBusy(false); }
      }
    } catch (e) { toast('道具用不了：' + apiHint((e && e.message) || String(e)).slice(0, 120), 'error'); }
  }
  function consume(p, note) {
    state.bag[p.id] = Math.max(0, bagCount(p.id) - 1);
    state.lastUse = p.name;
    pushLog({ who: 'sys', cls: 'drop', text: '用了 ' + p.emoji + ' ' + p.name + (note ? '　' + note : ''), ts: Date.now() });
    renderAll(); scrollBottom();
    if (note) toast(p.emoji + ' ' + note, 'ok');
  }

  /* ================================================================
     事件
     ================================================================ */
  var H = {};
  function bindEvents() {
    try {
      H.wi = function (entries) { try { activatedEntries = Array.isArray(entries) ? entries.slice(0, 40) : []; } catch (e) {} };
      eventOn(tavern_events.WORLD_INFO_ACTIVATED, H.wi);
    } catch (e) {}
    try {
      H.gen = function () {
        if (!settings.auto) return;
        var lastId = -1, key = '';
        try {
          lastId = getLastMessageId();
          var ms = getChatMessages(lastId, { include_swipes: true }) || [];
          var lm = ms[0];
          if (!lm || lm.role === 'user') return;
          key = lastId + ':' + (typeof lm.swipe_id === 'number' ? lm.swipe_id : 0);
        } catch (e) { return; }
        if (key === lastAutoKey) return;
        lastAutoKey = key;
        autoCounter++;
        if (state.bound && autoCounter % Math.max(1, settings.everyN) !== 0) return;
        if (busy) { pendingAuto = true; return; }
        setTimeout(function () { if (!busy) turn('', 'auto'); else pendingAuto = true; }, 900);
      };
      eventOn(tavern_events.GENERATION_ENDED, H.gen);
    } catch (e) {}
    try {
      H.chat = function () { activatedEntries = []; lastAutoKey = ''; autoCounter = 0; pendingAuto = false; setUnread(0); loadState(); if (mounted) renderAll(); };
      eventOn(tavern_events.CHAT_CHANGED, H.chat);
    } catch (e) {}
    try {
      H.btn = function () { if (!mounted) mount(); var open = isOpen(); placeBall(); setOpen(!open); if (!open) setUnread(0); };
      if (typeof replaceScriptButtons === 'function') replaceScriptButtons([{ name: BTN, visible: true }]);
      eventOn(getButtonEvent(BTN), H.btn);
    } catch (e) {}
    try {
      H.key = function (e) { if (e.key === 'Escape' && isOpen()) setOpen(false); };
      DOC.addEventListener('keydown', H.key);
    } catch (e) {}
  }
  function unbindEvents() {
    try { if (H.wi) eventOff(tavern_events.WORLD_INFO_ACTIVATED, H.wi); } catch (e) {}
    try { if (H.gen) eventOff(tavern_events.GENERATION_ENDED, H.gen); } catch (e) {}
    try { if (H.chat) eventOff(tavern_events.CHAT_CHANGED, H.chat); } catch (e) {}
    try { if (H.btn) eventOff(getButtonEvent(BTN), H.btn); } catch (e) {}
    try { if (H.key) DOC.removeEventListener('keydown', H.key); } catch (e) {}
    H = {};
  }

  /* ================================================================
     清理：挂到 parent 上的东西必须自己收
     ================================================================ */
  var cleaned = false;
  function cleanup() {
    if (cleaned) return; cleaned = true;
    unbindEvents();
    unmount();
    if (vvBound) {
      try { if (VIEW.visualViewport) VIEW.visualViewport.removeEventListener('resize', vvBound); } catch (e) {}
      try { VIEW.removeEventListener('resize', vvBound); } catch (e) {}
      try { VIEW.removeEventListener('orientationchange', vvBound); } catch (e) {}
      vvBound = null;
    }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (kvTimer) { clearTimeout(kvTimer); kvTimer = null; }
    if (snapTimer) { clearTimeout(snapTimer); snapTimer = null; }
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
    try { uninjectPrompts([ADOPT_ID, PROP_ID]); } catch (e) {}
    if (VIEW[INSTANCE_KEY] === cleanup) VIEW[INSTANCE_KEY] = null;
    console.log('[Asu-02] 收拾干净走了');
  }
  VIEW[INSTANCE_KEY] = cleanup;
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('unload', cleanup);

  /* ================================================================
     启动
     ================================================================ */
  loadState();
  bindEvents();
  mount();
  console.log('%c🦁 Asu-02 %cv' + VERSION + ' · ' + (state.bound ? '在线，叫你「' + state.host + '」' : '等绑定'),
    'font-weight:700;color:#1a1207;background:#e2a93b;padding:3px 8px;border-radius:4px 0 0 4px',
    'color:#ddd;background:#1a1a2e;padding:3px 8px;border-radius:0 4px 4px 0');
})();
