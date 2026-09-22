"""统一学生端接口的最小回归测试。"""

from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from apps import server


class StudentApiIntegrationTest(unittest.TestCase):
    sid = "test-student-api-integration"

    def setUp(self) -> None:
        self.client = TestClient(server.app)
        server.SESSIONS.pop(self.sid, None)
        server._path(self.sid).unlink(missing_ok=True)

    def tearDown(self) -> None:
        session = server.SESSIONS.pop(self.sid, None)
        if session:
            session["stop"].set()
        server._path(self.sid).unlink(missing_ok=True)

    def test_resources_and_single_ai_message_flow(self) -> None:
        courses = self.client.get("/api/student/courses")
        self.assertEqual(courses.status_code, 200)
        lesson_id = courses.json()["courses"][0]["lessons"][0]["lessonId"]

        lesson = self.client.get("/api/lesson", params={"lessonId": lesson_id})
        self.assertEqual(lesson.status_code, 200)
        self.assertGreater(lesson.json()["lesson"]["segmentCount"], 0)

        payload = {"session_id": self.sid, "lesson_id": lesson_id}
        first = self.client.post("/api/session/start", json=payload)
        self.assertEqual(first.json()["status"], "idle")

        begun = self.client.post(f"/api/session/{self.sid}/begin")
        self.assertEqual(begun.status_code, 200)
        self.assertEqual(begun.json()["status"], "running")

        repeated = self.client.post("/api/session/start", json=payload)
        self.assertEqual(repeated.json()["status"], "running")
        self.assertEqual(repeated.json()["phase"], begun.json()["phase"])

        media = self.client.post(f"/api/session/{self.sid}/media/done", json={})
        self.assertEqual(media.status_code, 200)
        self.assertEqual(media.json()["phase"], "recap_discussion")
        state = self.client.get(f"/api/session/{self.sid}/state").json()
        self.assertIn("class_discussion", state["remaining_stages"])

        answer = self.client.post(
            f"/api/session/{self.sid}/message",
            json={"text": "调度负责在多个就绪进程之间分配 CPU，并决定运行多久。"},
        )
        self.assertEqual(answer.status_code, 200)
        self.assertIn("reply_text", answer.json())
        self.assertEqual(answer.json()["phase"], "recap_discussion")
        self.assertEqual(answer.json()["status"], "running")

        deep = self.client.post(f"/api/session/{self.sid}/stage/next")
        self.assertEqual(deep.json()["phase"], "deep_inquiry")
        discussion = self.client.post(f"/api/session/{self.sid}/stage/next")
        self.assertEqual(discussion.json()["phase"], "class_discussion")
        discussion_reply = self.client.post(
            f"/api/session/{self.sid}/message",
            json={"text": "我认为时间片轮转更重视交互任务的响应速度。"},
        )
        self.assertEqual(discussion_reply.json()["phase"], "class_discussion")
        self.assertEqual(discussion_reply.json()["status"], "running")


if __name__ == "__main__":
    unittest.main()
