-- Named preset text blocks for the guide editor "+ Add block" menu.
CREATE TABLE "TextBlockPreset" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TextBlockPreset_pkey" PRIMARY KEY ("id")
);

-- Starter preset (editable later under Text presets).
INSERT INTO "TextBlockPreset" ("id", "label", "html", "text", "sortOrder", "createdAt", "updatedAt")
VALUES (
  'seed_relay_connection',
  'Relay Connection',
  '<p><strong>Relay Connection</strong></p><ul><li><strong>IGLA Yellow + IGLA Relay Yellow + IGLA Relay Purple</strong> → Connector side of the cut wire.</li><li><strong>IGLA Relay Black</strong> → Vehicle side of the cut wire.</li><li><strong>IGLA White/Blue</strong> → IGLA Relay Blue.</li><li>Verify the IGLA Blue wire is configured for Analog Blocking.</li></ul>',
  E'Relay Connection\n\nIGLA Yellow + IGLA Relay Yellow + IGLA Relay Purple → Connector side of the cut wire.\nIGLA Relay Black → Vehicle side of the cut wire.\nIGLA White/Blue → IGLA Relay Blue.\nVerify the IGLA Blue wire is configured for Analog Blocking.',
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
