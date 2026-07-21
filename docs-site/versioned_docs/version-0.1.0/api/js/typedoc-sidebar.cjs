// @ts-check
/** @type {import("@docusaurus/plugin-content-docs").SidebarsConfig} */
const typedocSidebar = {
  items: [
    {
      type: "category",
      label: "core",
      items: [
        {
          type: "category",
          label: "src",
          items: [
            {
              type: "category",
              label: "Classes",
              items: [
                {
                  type: "doc",
                  id: "api/js/core/src/classes/AuthError",
                  label: "AuthError"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/classes/EchoMirrorClient",
                  label: "EchoMirrorClient"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/classes/EchoMirrorError",
                  label: "EchoMirrorError"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/classes/NetworkError",
                  label: "NetworkError"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/classes/RateLimitError",
                  label: "RateLimitError"
                }
              ]
            },
            {
              type: "category",
              label: "Interfaces",
              items: [
                {
                  type: "doc",
                  id: "api/js/core/src/interfaces/AIReflection",
                  label: "AIReflection"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/interfaces/EchoMirrorConfig",
                  label: "EchoMirrorConfig"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/interfaces/EchoTransfer",
                  label: "EchoTransfer"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/interfaces/GlobalFeedEntry",
                  label: "GlobalFeedEntry"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/interfaces/LeaderboardEntry",
                  label: "LeaderboardEntry"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/interfaces/MoodEntry",
                  label: "MoodEntry"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/interfaces/MoodStreak",
                  label: "MoodStreak"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/interfaces/MoodSummary",
                  label: "MoodSummary"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/interfaces/StellarBalance",
                  label: "StellarBalance"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/interfaces/StellarTransaction",
                  label: "StellarTransaction"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/interfaces/UserProfile",
                  label: "UserProfile"
                }
              ]
            },
            {
              type: "category",
              label: "Type Aliases",
              items: [
                {
                  type: "doc",
                  id: "api/js/core/src/type-aliases/MoodScore",
                  label: "MoodScore"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/type-aliases/MoodTag",
                  label: "MoodTag"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/type-aliases/SDKEvent",
                  label: "SDKEvent"
                },
                {
                  type: "doc",
                  id: "api/js/core/src/type-aliases/SDKEventHandler",
                  label: "SDKEventHandler"
                }
              ]
            }
          ],
          link: {
            type: "doc",
            id: "api/js/core/src/index"
          }
        }
      ]
    },
    {
      type: "category",
      label: "mood",
      items: [
        {
          type: "category",
          label: "src",
          items: [
            {
              type: "category",
              label: "Interfaces",
              items: [
                {
                  type: "doc",
                  id: "api/js/mood/src/interfaces/AIReflection",
                  label: "AIReflection"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/interfaces/GetMoodHistoryOptions",
                  label: "GetMoodHistoryOptions"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/interfaces/LogMoodPayload",
                  label: "LogMoodPayload"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/interfaces/MoodEntry",
                  label: "MoodEntry"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/interfaces/MoodStreak",
                  label: "MoodStreak"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/interfaces/MoodSummary",
                  label: "MoodSummary"
                }
              ]
            },
            {
              type: "category",
              label: "Type Aliases",
              items: [
                {
                  type: "doc",
                  id: "api/js/mood/src/type-aliases/MoodScore",
                  label: "MoodScore"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/type-aliases/MoodTag",
                  label: "MoodTag"
                }
              ]
            },
            {
              type: "category",
              label: "Functions",
              items: [
                {
                  type: "doc",
                  id: "api/js/mood/src/functions/deleteMoodEntry",
                  label: "deleteMoodEntry"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/functions/getAIReflection",
                  label: "getAIReflection"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/functions/getMoodEntry",
                  label: "getMoodEntry"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/functions/getMoodHistory",
                  label: "getMoodHistory"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/functions/getMoodStreak",
                  label: "getMoodStreak"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/functions/getMoodSummary",
                  label: "getMoodSummary"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/functions/logMood",
                  label: "logMood"
                },
                {
                  type: "doc",
                  id: "api/js/mood/src/functions/requestAIReflection",
                  label: "requestAIReflection"
                }
              ]
            }
          ],
          link: {
            type: "doc",
            id: "api/js/mood/src/index"
          }
        }
      ]
    },
    {
      type: "category",
      label: "react",
      items: [
        {
          type: "category",
          label: "src",
          items: [
            {
              type: "category",
              label: "Interfaces",
              items: [
                {
                  type: "doc",
                  id: "api/js/react/src/interfaces/EchoMirrorProviderProps",
                  label: "EchoMirrorProviderProps"
                }
              ]
            },
            {
              type: "category",
              label: "Functions",
              items: [
                {
                  type: "doc",
                  id: "api/js/react/src/functions/EchoMirrorProvider",
                  label: "EchoMirrorProvider"
                },
                {
                  type: "doc",
                  id: "api/js/react/src/functions/useEchoMirrorClient",
                  label: "useEchoMirrorClient"
                },
                {
                  type: "doc",
                  id: "api/js/react/src/functions/useMoodStreak",
                  label: "useMoodStreak"
                },
                {
                  type: "doc",
                  id: "api/js/react/src/functions/useProfile",
                  label: "useProfile"
                },
                {
                  type: "doc",
                  id: "api/js/react/src/functions/useSDKEvent",
                  label: "useSDKEvent"
                }
              ]
            }
          ],
          link: {
            type: "doc",
            id: "api/js/react/src/index"
          }
        }
      ]
    },
    {
      type: "category",
      label: "stellar",
      items: [
        {
          type: "category",
          label: "src",
          items: [
            {
              type: "category",
              label: "Interfaces",
              items: [
                {
                  type: "doc",
                  id: "api/js/stellar/src/interfaces/EchoTransfer",
                  label: "EchoTransfer"
                },
                {
                  type: "doc",
                  id: "api/js/stellar/src/interfaces/FreighterConnection",
                  label: "FreighterConnection"
                },
                {
                  type: "doc",
                  id: "api/js/stellar/src/interfaces/StellarBalance",
                  label: "StellarBalance"
                },
                {
                  type: "doc",
                  id: "api/js/stellar/src/interfaces/StellarTransaction",
                  label: "StellarTransaction"
                }
              ]
            },
            {
              type: "category",
              label: "Functions",
              items: [
                {
                  type: "doc",
                  id: "api/js/stellar/src/functions/connectFreighter",
                  label: "connectFreighter"
                },
                {
                  type: "doc",
                  id: "api/js/stellar/src/functions/fundTestnetAccount",
                  label: "fundTestnetAccount"
                },
                {
                  type: "doc",
                  id: "api/js/stellar/src/functions/getBalance",
                  label: "getBalance"
                },
                {
                  type: "doc",
                  id: "api/js/stellar/src/functions/getTransactionHistory",
                  label: "getTransactionHistory"
                },
                {
                  type: "doc",
                  id: "api/js/stellar/src/functions/sendEcho",
                  label: "sendEcho"
                },
                {
                  type: "doc",
                  id: "api/js/stellar/src/functions/signWithFreighter",
                  label: "signWithFreighter"
                },
                {
                  type: "doc",
                  id: "api/js/stellar/src/functions/submitTransaction",
                  label: "submitTransaction"
                }
              ]
            }
          ],
          link: {
            type: "doc",
            id: "api/js/stellar/src/index"
          }
        }
      ]
    }
  ]
};
module.exports = typedocSidebar.items;