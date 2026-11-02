#!/usr/bin/env python3
"""Build and update the 90-day Curriculum Calendar & Active-Time Ledger."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURRICULUM_DIR = ROOT / "curriculum"
DAYS_DIR = CURRICULUM_DIR / "days"
CONTENT_CALENDAR_DIR = CURRICULUM_DIR / "content" / "calendar"

DAYS_DIR.mkdir(parents=True, exist_ok=True)
CONTENT_CALENDAR_DIR.mkdir(parents=True, exist_ok=True)

BLOCK_SPECS = [
    (25, "Diagnosis, Learning Methods, and Environment",
     "诊断、学习方法与环境配置", "診斷、學習方法與環境配置", "診断、学習法、開発環境"),
    (26, "Python Values, Types, and Conditions",
     "Python 数值、类型与条件分支", "Python 數值、類型與條件分支", "Pythonの数値、型と条件分岐"),
    (27, "Loops, Functions, and Containers",
     "循环、函数与数据容器", "循環、函數與資料容器", "ループ、関数とコンテナ"),
    (28, "Files, Exceptions, Environments, and Tests",
     "文件、异常、环境与测试", "檔案、異常、環境與測試", "ファイル、例外、仮想環境とテスト"),
    (29, "Text Project and Git Collaboration",
     "文本工具项目与 Git 协作", "文本工具專案與 Git 協作", "テキストツール開発とGit協調作業"),
    (30, "Functions, Limits, and Derivatives",
     "函数、极限与导数几何直觉", "函數、極限與導數幾何直覺", "関数、極限と微分の直感"),
    (31, "Chain Rule and Multivariable Gradients",
     "链式法则与多元梯度计算", "鏈式法則與多元梯度計算", "合成関数の微分と多変数勾配"),
    (32, "Linear Algebra and Tensor Reasoning",
     "线性代数与张量维度演算", "線性代數與張量維度演算", "線形代数とテンソル計算"),
    (33, "Probability, Sampling, and Information",
     "概率、采样与信息熵直觉", "機率、採樣與資訊熵直覺", "確率、サンプリングと情報エントロピー"),
    (34, "Statistics, Evaluation, and Optimization",
     "统计推断、评估指标与优化器", "統計推論、評估指標與優化器", "統計的評価と最適化手法"),
    (35, "Independently Implement Automatic Differentiation",
     "独立实现自动微分引擎 (Autograd)", "獨立實現自動微分引擎 (Autograd)", "自動微分の独自実装"),
    (36, "MLPs and Backpropagation",
     "多层感知机与反向传播推导", "多層感知機與反向傳播推導", "多層パーセプトロンと誤差逆伝播法"),
    (37, "Text Modeling and Tokenization",
     "文本统计建模与 Tokenizer 原理", "文本統計建模與 Tokenizer 原理", "言語統計モデルとトークナイザー"),
    (38, "Embeddings and Neural Language Models",
     "词嵌入向量与神经语言模型", "詞嵌入向量與神經語言模型", "単語埋め込みとニューラル言語モデル"),
    (39, "Attention and Causal Constraints",
     "自注意力机制与因果因数掩码", "自注意力機制與因果因數掩碼", "自己注意機構と因果マスク"),
    (40, "Assemble and Explain a Transformer",
     "Transformer 架构组装与拆解", "Transformer 架構組裝與拆解", "Transformerの構造と実装"),
    (41, "Run the Pretraining Loop",
     "运行从零预训练闭环 (Pretraining)", "運行從零預訓練閉環 (Pretraining)", "言語モデルの事前学習ループ"),
    (42, "Generation, Overfitting, and Evaluation",
     "自回归生成、过拟合诊断与科学评估", "自回歸生成、過擬合診斷與科學評估", "自己回帰生成、過学習診断と評価"),
    (43, "Checkpoints and Resource Planning",
     "权重保存、断点恢复与算力预估", "權重保存、斷點恢復與算力預估", "チェックポイント保存とリソース計画"),
    (44, "Reproduce Cloud-GPU Pretraining",
     "云端 GPU 预训练复现与实验追踪", "雲端 GPU 預訓練複現與實驗追蹤", "クラウドGPUを用いた事前学習実験"),
    (45, "Instruction Data and Training Objectives",
     "指令微调数据构造与目标损失", "指令微調資料構造與目標損失", "指示データセットと学習目標"),
    (46, "LoRA Mathematics and Engineering",
     "LoRA 低秩自适应数学原理与实现", "LoRA 低秩自適應數學原理與實現", "LoRAの数理と実装"),
    (47, "Run the Real Fine-Tuning Experiment",
     "运行真实开源大模型微调实验", "運行真實開源大模型微調實驗", "オープンモデルのファインチューニング実験"),
    (48, "Evaluate Models and Attribute Failures",
     "模型对比评估、归因分析与报告", "模型對比評估、歸因分析與報告", "モデル評価と比較・失敗原因分析"),
    (49, "Agent Loops and Tool Protocols",
     "Agent 核心循环与工具调用协议", "Agent 核心循環與工具調用協議", "エージェントループとツールプロトコル"),
    (50, "Agent State, Retries, and Execution Limits",
     "状态管理、重试策略与安全执行边界", "狀態管理、重試策略與安全執行邊界", "状態遷移、再試行制御と安全性"),
    (51, "Deliver Engineering Work with an Agent",
     "协同 Agent 交付工程代码与 CI/CD", "協同 Agent 交付工程代碼與 CI/CD", "エージェント協調開発とCI/CD"),
    (52, "Evaluate Agents Scientifically",
     "科学化 Agent 评测基准设计", "科學化 Agent 評測基準設計", "エージェント評価とベンチマーク設計"),
    (53, "Integrate the Capstone Learning Project",
     "综合项目开发与系统集成", "綜合專案開發與系統整合", "統合キャップストーンプロジェクト"),
    (54, "Demonstrate Mastery and Assemble a Portfolio",
     "独立掌握度终审、作品集与展望", "獨立掌握度終審、作品集與展望", "習得度評価、ポートフォリオ構築と修了"),
]

WEEKLY_REVIEW_DAYS = {7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 89, 90}

def get_day_category(day_num):
    if 1 <= day_num <= 15:
        return "self-directed-learning-and-python"
    elif 16 <= day_num <= 33:
        return "mathematics"
    elif 34 <= day_num <= 69:
        return "models-and-training"
    elif 70 <= day_num <= 72:
        return "self-directed-learning-and-python"
    elif day_num in (73, 74):
        return "agents"
    elif day_num == 75:
        return "agents"  # primary category, activities split 240m agents + 240m sdl
    elif 76 <= day_num <= 78:
        return "agents"
    elif 79 <= day_num <= 81:
        return "self-directed-learning-and-python"
    elif 82 <= day_num <= 87:
        return "agents"
    elif 88 <= day_num <= 89:
        return "agents"
    elif day_num == 90:
        return "self-directed-learning-and-python"
    return "self-directed-learning-and-python"

def generate_manifest():
    blocks = []
    for idx, (ticket, en_t, zh_t, zht_t, ja_t) in enumerate(BLOCK_SPECS, 1):
        s_day = (idx - 1) * 3 + 1
        e_day = (idx - 1) * 3 + 3
        cat = get_day_category(s_day)
        blocks.append({
            "block_number": idx,
            "ticket_number": ticket,
            "start_day": s_day,
            "end_day": e_day,
            "topic_category": cat,
            "title": en_t,
            "title_zh_Hans": zh_t,
            "title_zh_Hant": zht_t,
            "title_ja": ja_t
        })

    lessons = []
    for i in range(1, 91):
        day_id = f"day-{i:02d}"
        cat = get_day_category(i)
        block_idx = (i - 1) // 3
        block = BLOCK_SPECS[block_idx]
        is_rev = i in WEEKLY_REVIEW_DAYS
        status = "available" if i == 1 else "planned"
        lessons.append({
            "id": f"les-{i:02d}",
            "title": f"Lesson {i:02d}: {block[1]} (Part {((i - 1) % 3) + 1})" if not is_rev else f"Lesson {i:02d}: Consolidation & Assessment Review",
            "study_days": [day_id],
            "topic_category": cat,
            "status": status,
            "objective": f"Mastery of core concepts in {block[1]} under verified criteria.",
            "prerequisites": [f"les-{i-1:02d}"] if i > 1 else []
        })

    manifest = {
        "version": "1.0.0",
        "curriculum_id": "90-day-ai-learning",
        "total_days": 90,
        "total_active_minutes": 43200,
        "total_hours": 720,
        "hours_per_day": 8,
        "minutes_per_day": 480,
        "category_hours": {
            "self-directed-learning-and-python": 180,
            "mathematics": 144,
            "models-and-training": 288,
            "agents": 108
        },
        "category_minutes": {
            "self-directed-learning-and-python": 10800,
            "mathematics": 8640,
            "models-and-training": 17280,
            "agents": 6480
        },
        "weekly_review_days": sorted(list(WEEKLY_REVIEW_DAYS)),
        "blocks": blocks,
        "lessons": lessons
    }

    manifest_file = CURRICULUM_DIR / "manifest.json"
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {manifest_file}")

def generate_days():
    # Day 01: preserve authored structure and content from Ticket 01
    day_01_path = DAYS_DIR / "day-01.json"
    if day_01_path.exists():
        day_01 = json.loads(day_01_path.read_text())
    else:
        day_01 = {"id": "day-01", "day_number": 1}

    day_01["id"] = "day-01"
    day_01["day_number"] = 1
    day_01["active_minutes"] = 480
    day_01["topic_category"] = "self-directed-learning-and-python"
    day_01["is_review_day"] = False
    day_01["status"] = "available"
    day_01["prerequisites"] = [
        "High-school reading comprehension",
        "Basic command-line terminal awareness"
    ]
    day_01["recovery_links"] = []
    for act in day_01.get("activities", []):
        act["category"] = "self-directed-learning-and-python"
        act["status"] = "available"
        act["lesson_id"] = "les-01"

    day_01_path.write_text(json.dumps(day_01, indent=2, ensure_ascii=False) + "\n")
    print(f"Updated {day_01_path}")

    # Days 02 to 90
    for i in range(2, 91):
        day_id = f"day-{i:02d}"
        cat = get_day_category(i)
        is_review = i in WEEKLY_REVIEW_DAYS
        prev_day = f"day-{i-1:02d}"
        
        # Determine recovery link: point to prior weekly review day or day-01
        last_review_day = max([d for d in WEEKLY_REVIEW_DAYS if d < i] or [1])
        recovery_links = [f"day-{last_review_day:02d}"]

        # Build activities summing to 480 min
        activities = []
        if i == 75:
            # Split day: 240m agents, 240m self-directed-learning-and-python
            activities = [
                {
                    "id": f"{day_id}-act-01",
                    "lesson_id": f"les-{i:02d}",
                    "title": f"{day_id.upper()} Agent Loop Diagnostics",
                    "active_minutes": 120,
                    "activity_type": "practice",
                    "category": "agents",
                    "status": "planned",
                    "assistance_policy": "agent_assisted",
                    "prerequisites": [prev_day],
                    "source_resources": []
                },
                {
                    "id": f"{day_id}-act-02",
                    "lesson_id": f"les-{i:02d}",
                    "title": f"{day_id.upper()} Tool Protocol Verification",
                    "active_minutes": 120,
                    "activity_type": "practice",
                    "category": "agents",
                    "status": "planned",
                    "assistance_policy": "independent",
                    "prerequisites": [f"{day_id}-act-01"],
                    "source_resources": []
                },
                {
                    "id": f"{day_id}-act-03",
                    "lesson_id": f"les-{i:02d}",
                    "title": f"{day_id.upper()} Safe Execution Harness & Logging",
                    "active_minutes": 120,
                    "activity_type": "practice",
                    "category": "self-directed-learning-and-python",
                    "status": "planned",
                    "assistance_policy": "independent",
                    "prerequisites": [f"{day_id}-act-02"],
                    "source_resources": []
                },
                {
                    "id": f"{day_id}-act-04",
                    "lesson_id": f"les-{i:02d}",
                    "title": f"{day_id.upper()} Bounded Retries & Error Traps",
                    "active_minutes": 120,
                    "activity_type": "practice",
                    "category": "self-directed-learning-and-python",
                    "status": "planned",
                    "assistance_policy": "independent",
                    "prerequisites": [f"{day_id}-act-03"],
                    "source_resources": []
                }
            ]
        else:
            # 4 activities of 120 min each
            act_types = ["lesson", "practice", "practice", "review" if is_review else "assessment"]
            for a_idx in range(1, 5):
                act_id = f"{day_id}-act-{a_idx:02d}"
                activities.append({
                    "id": act_id,
                    "lesson_id": f"les-{i:02d}",
                    "title": f"{day_id.upper()} Activity {a_idx}",
                    "active_minutes": 120,
                    "activity_type": act_types[a_idx - 1],
                    "category": cat,
                    "status": "planned",
                    "assistance_policy": "independent" if a_idx in (2, 4) else "agent_assisted",
                    "prerequisites": [prev_day] if a_idx == 1 else [f"{day_id}-act-{a_idx-1:02d}"],
                    "source_resources": []
                })

        day_obj = {
            "id": day_id,
            "day_number": i,
            "active_minutes": 480,
            "topic_category": cat,
            "is_review_day": is_review,
            "status": "planned",
            "prerequisites": [prev_day],
            "recovery_links": recovery_links,
            "activities": activities
        }

        (DAYS_DIR / f"{day_id}.json").write_text(json.dumps(day_obj, indent=2, ensure_ascii=False) + "\n")
    print("Wrote all 90 day files in curriculum/days/")

def generate_calendar_content():
    languages = {
        "zh-Hans": {
            "page_title": "90 天课程日历与有效学习时间台账",
            "page_subtitle": "前置依赖全景、每周复习沉淀与 43,200 分钟透明时间预算",
            "ledger_title": "课程学习时间总账 (Time Ledger)",
            "total_days_label": "学习日",
            "total_hours_label": "活跃学时",
            "total_minutes_label": "有效分钟",
            "category_hours_label": "类别学时预算",
            "categories": {
                "self-directed-learning-and-python": "自律学习与 Python 工程",
                "mathematics": "AI 数学与微积分/代数",
                "models-and-training": "模型原理与训练微调",
                "agents": "AI Agent 与工程实践"
            },
            "status_labels": {
                "planned": "规划中",
                "available": "可学习",
                "reviewed": "已复核",
                "accepted": "已验收"
            },
            "review_badge": "周度复习与考核日",
            "prerequisites_label": "前置要求",
            "recovery_label": "补救/复习路径",
            "open_day": "进入学习日",
            "planned_notice": "本学习日内容规划中，依据 Course Readiness Gate 验收要求，未完成内容不可显示为就绪状态。",
            "nav_calendar": "课程日历与台账",
        },
        "zh-Hant": {
            "page_title": "90 天課程行事曆與有效學習時間台帳",
            "page_subtitle": "前置依賴全景、每週複習沉澱與 43,200 分鐘透明時間預算",
            "ledger_title": "課程學習時間總帳 (Time Ledger)",
            "total_days_label": "學習日",
            "total_hours_label": "活躍學時",
            "total_minutes_label": "有效分鐘",
            "category_hours_label": "類別學時預算",
            "categories": {
                "self-directed-learning-and-python": "自律學習與 Python 工程",
                "mathematics": "AI 數學與微積分/代數",
                "models-and-training": "模型原理與訓練微調",
                "agents": "AI Agent 與工程實踐"
            },
            "status_labels": {
                "planned": "規劃中",
                "available": "可學習",
                "reviewed": "已複核",
                "accepted": "已驗收"
            },
            "review_badge": "週度複習與考核日",
            "prerequisites_label": "前置要求",
            "recovery_label": "補救/複習路徑",
            "open_day": "進入學習日",
            "planned_notice": "本學習日內容規劃中，依據 Course Readiness Gate 驗收要求，未完成內容不可顯示為就緒狀態。",
            "nav_calendar": "課程行事曆與台帳",
        },
        "en": {
            "page_title": "90-Day Curriculum Calendar & Active-Time Ledger",
            "page_subtitle": "Complete prerequisite DAG, weekly consolidation review, and 43,200-minute effort ledger",
            "ledger_title": "Active-Time Effort Ledger",
            "total_days_label": "Study Days",
            "total_hours_label": "Active Hours",
            "total_minutes_label": "Active Minutes",
            "category_hours_label": "Category Hour Budgets",
            "categories": {
                "self-directed-learning-and-python": "Self-Directed Learning & Python",
                "mathematics": "AI Mathematics & Calculus",
                "models-and-training": "Models, Pretraining & LoRA",
                "agents": "AI Agents & Systems"
            },
            "status_labels": {
                "planned": "Planned",
                "available": "Available",
                "reviewed": "Reviewed",
                "accepted": "Accepted"
            },
            "review_badge": "Weekly Review & Assessment",
            "prerequisites_label": "Prerequisites",
            "recovery_label": "Recovery Links",
            "open_day": "Open Study Day",
            "planned_notice": "This study day is currently planned. Per the Course Readiness Gate, unfinished material cannot appear ready.",
            "nav_calendar": "Curriculum Calendar",
        },
        "ja": {
            "page_title": "90日間カリキュラムカレンダー＆学習時間台帳",
            "page_subtitle": "前提依存関係DAG、週次復習・定着確認、43,200分の透明な学習時間予算",
            "ledger_title": "学習時間総合台帳 (Time Ledger)",
            "total_days_label": "学習日",
            "total_hours_label": "アクティブ学習時間",
            "total_minutes_label": "有効分",
            "category_hours_label": "カテゴリ別時間配分",
            "categories": {
                "self-directed-learning-and-python": "自律学習とPythonエンジニアリング",
                "mathematics": "AI数学・微積分・線形代数",
                "models-and-training": "モデル構造・事前学習・LoRA",
                "agents": "AIエージェントとシステム開発"
            },
            "status_labels": {
                "planned": "予定",
                "available": "学習可能",
                "reviewed": "レビュー済",
                "accepted": "承認済"
            },
            "review_badge": "週次復習・評価日",
            "prerequisites_label": "前提条件",
            "recovery_label": "復習・リ remedial リンク",
            "open_day": "学習日を開始",
            "planned_notice": "この学習日は現在計画中です。Course Readiness Gateの規定に基づき、未完了の教材が準備完了として表示されることはありません。",
            "nav_calendar": "カリキュラムカレンダー",
        }
    }

    for lang, data in languages.items():
        out_file = CONTENT_CALENDAR_DIR / f"{lang}.json"
        out_file.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        print(f"Wrote {out_file}")

if __name__ == "__main__":
    generate_manifest()
    generate_days()
    generate_calendar_content()
    print("Curriculum calendar and ledger build complete.")
