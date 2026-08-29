"""
PICKX Engine - 웹앱 서버
문제 생성 로직(engine.py)은 절대 건드리지 않고 그대로 재사용한다.
UI는 이 파일 + templates/index.html + static/ 안에서만 처리한다.
"""

import os
import sys

from flask import Flask, jsonify, render_template, request, session

# 상위 폴더(instinct/)의 engine.py를 그대로 import
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine import generate_problem_set  # noqa: E402  (엔진 로직 단일 소스, 수정 금지)

app = Flask(__name__)
# 서버리스(Vercel) 환경은 요청마다 콜드스타트로 모듈이 새로 로드될 수 있어서
# 매번 랜덤 키를 쓰면 세션(중복 방지용 _last_problem_signature)이 자꾸 끊긴다.
# 배포 시 SECRET_KEY 환경변수를 넣으면 그걸 쓰고, 없으면 고정 데모 키로 폴백한다.
app.secret_key = os.environ.get("SECRET_KEY", "pickx-engine-demo-fixed-key-2f9a7c3e1b6d4859")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/generate", methods=["POST"])
def api_generate():
    data = request.get_json(silent=True) or {}

    try:
        count = int(data.get("count", 1))
        if count < 1:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "문항 수는 1 이상의 정수로 입력해 주세요."}), 400

    try:
        difficulty = int(data.get("difficulty", 2))
        if difficulty not in (1, 2, 3, 4):
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "난이도 값이 올바르지 않습니다."}), 400

    last_signature = session.get("last_signature")
    exclude = tuple(last_signature) if last_signature else None

    problems, signature = generate_problem_set(count, difficulty, exclude_signature=exclude)
    session["last_signature"] = list(signature)

    return jsonify({"problems": problems})


if __name__ == "__main__":
    # host="0.0.0.0" 로 열어야 같은 wifi의 태블릿/폰에서도 접속 가능
    app.run(host="0.0.0.0", port=5000, debug=True)
