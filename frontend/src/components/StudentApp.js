"use client";

import { useCallback, useEffect, useState } from "react";
import { legacyMarkup } from "./legacyMarkup";
import { courseMarkup } from "./courseMarkup";
import StudentLogin from "./StudentLogin";
import StudentEnroll from "./StudentEnroll";

const appMarkup = legacyMarkup
  .replace('<main class="app">', '<main class="app">' + courseMarkup)
  .replace('<section class="hub" id="hub"', '<section class="hub" id="hub" hidden');

export default function StudentApp() {
  // auth  = 登录/注册（含会话检查）；enroll = 一门课都没有，先加入；
  // app   = 正常上课
  const [gate, setGate] = useState("auth");
  // 已经在应用里，又点开"加入课程"（和上面的 enroll 门是两回事）
  const [enrolling, setEnrolling] = useState(false);
  const [ready, setReady] = useState(false);

  const handleAuth = useCallback((student, courses) => {
    setGate(Array.isArray(courses) && courses.length ? "app" : "enroll");
  }, []);

  // 登录通过之后才加载 legacy 应用 —— 别让它在登录页背后偷偷发请求
  useEffect(() => {
    if (gate !== "app") return;
    let active = true;

    import("../legacy/app.js").then(() => {
      if (active) setReady(true);
    }).catch((error) => {
      console.error("学生端初始化失败", error);
    });

    return () => {
      active = false;
    };
  }, [gate]);

  const handleJoined = useCallback(() => {
    if (enrolling) {
      // 应用已经在跑，课程列表是它启动时拉的 —— 重载一次最省事也最可靠
      window.location.reload();
    } else {
      setGate("app");
    }
  }, [enrolling]);

  if (gate === "auth") {
    return <StudentLogin onDone={handleAuth} />;
  }

  if (gate === "enroll") {
    // required：一门课都没有，没有"稍后再说"这个退路
    return <StudentEnroll required onDone={handleJoined} />;
  }

  return (
    <>
      <div
        data-app-ready={ready ? "true" : "false"}
        dangerouslySetInnerHTML={{ __html: appMarkup }}
      />

      {ready ? (
        <button
          type="button"
          className="join-fab"
          onClick={() => setEnrolling(true)}
        >
          加入课程
        </button>
      ) : null}

      {enrolling ? (
        <StudentEnroll
          onDone={handleJoined}
          onSkip={() => setEnrolling(false)}
        />
      ) : null}
    </>
  );
}
