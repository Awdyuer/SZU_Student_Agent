"use client";

import { useEffect, useState } from "react";
import { legacyMarkup } from "./legacyMarkup";

export default function StudentApp() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    import("../legacy/app.js").then(() => {
      if (active) setReady(true);
    }).catch((error) => {
      console.error("学生端初始化失败", error);
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div
      data-app-ready={ready ? "true" : "false"}
      dangerouslySetInnerHTML={{ __html: legacyMarkup }}
    />
  );
}
