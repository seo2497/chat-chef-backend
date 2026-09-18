import express from "express";
import cors from "cors"
import * as dotenv from "dotenv";
import OpenAI from "openai";

//  Express 애플리케이션 객체 생성
const app = express();

//환경변수 로드(key 값을 가져오기 때문에 )
dotenv.config();

// CORS 설정
const corsOption = {
  origin: process.env.CLIENT_URL,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"], // 응답헤더 설정
};

app.use(cors(corsOption));

// Json 설정
// 프론트엔드에서 받은 Json형태의 데이터를 자바스크립트 객체로 파싱(변환)하여 사용
app.use(express.json()); // for parsing application/jso
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

// epenai 설정
const openai = new OpenAI({
  apiKey:process.env.OPENAI_API_KEY
})

const chatTest = async() => {
  try {
    // 제대로 실행 될때
    const response = await openai.chat.completions.create({
      model:"gpt-4o",
      temperature:1,
      max_tokens:4000,
      messages:[
        {
          role:"user",content:"오늘 서울 날씨가 어때?"
        }
      ]
    })
    console.log("🚀 ~ chatTest ~ response:", response.choices[0].message)

  } catch (error) {
    // try 에서 에러 났을때
    console.log(error)
  }
}


// ============================================================
// 챗봇 API 설정
// ============================================================

/**
 * initialMessage
 * - 실행되는 로직이 아니라, "재료 목록"을 받아서
 *   OpenAI Chat API에 보낼 messages 배열을 만들어주는 준비 함수(팩토리).
 * - 이 함수 자체는 서버가 켜질 때 실행되지 않고,
 *   /recipe 라우터 안에서 호출될 때 실행됨.
 *
 * @param {Array} ingredientList - 프론트엔드에서 전달한 재료 배열. 각 원소는 { value: string } 형태로 추정.
 * @returns {Array} OpenAI에 보낼 messages 배열 [system, user]
 */
const initialMessage = (ingredientList) => {
  return [
    {
      // system 메시지: 챗봇의 역할과 첫 응답을 고정된 문구로 제한
      role: "system",
      content: `당신은 "맛있는 쉐프"라는 이름의 전문 요리사입니다. 사용자가 재료 목록을 제공하면, 첫번째 답변에서는 오직 다음 문장만을 응답으로 제공해야 합니다. 다른 어떤 정보도 추가하지 마세요: 제공해주신 재료 목록을 보니 정말 맛있는 요리를 만들 수 있을 것 같아요. 어떤 종류의 요리를 선호하시나요? 간단한 한끼 식사, 특별한 저녁 메뉴, 아니면 가벼운 간식 등 구체적인 선호도가 있으시다면 말씀해 주세요. 그에 맞춰 최고의 레시피를 제안해 드리겠습니다!`,
    },
    {
      // user 메시지: 사용자가 재료를 말한 것처럼 문장을 구성
      // ingredientList.map(...).join(", ") → 각 재료의 value만 뽑아 콤마로 연결
      role: "user",
      content: `안녕하세요, 맛있는 쉐프님. 제가 가진 재료로 요리를 하고 싶은데 도와주실 수 있나요? 제 냉장고에 있는 재료들은 다음과 같아요: ${ingredientList
        .map((item) => item.value)
        .join(", ")}`,
    },
  ];
};

// ============================================================
// [POST] /recipe : 대화 시작 지점 (첫 번째 요청)
// - 프론트엔드에서 사용자가 재료를 처음 입력하고 제출했을 때 호출됨
// ============================================================
app.post("/recipe", async (req, res) => {
  // 요청 본문에서 재료 목록 꺼내기, 구조분해 할당
  const { ingredientList } = req.body;  //재료 목록

  // openai에게 보낼 메세지 배열, 재료 목록을 기반으로 system + user 메시지 배열 생성
  const messages = initialMessage(ingredientList);

  try {
    // OpenAI Chat Completions API 호출
    const response = await openai.chat.completions.create({
      model: "gpt-4o",        // 사용할 모델
      messages,                // 위에서 만든 [system, user] 메시지 key, valus 가 동일하면 축약할 수 있음
      temperature: 1,          // 응답의 창의성/무작위성 정도 (0~2, 높을수록 다양한 응답)
      max_tokens: 4000,        // 응답 최대 토큰 수
      top_p: 1,                // nucleus sampling 확률 (temperature와 함께 응답 다양성 조절)
    });

    // 기존 messages(system, user) 뒤에 GPT의 응답(assistant)을 이어 붙여
    // 전체 대화 기록 배열을 만듦 → [system, user, assistant]
    const data = [...messages, response.choices[0].message];

    console.log("data", data);

    // 프론트엔드에 전체 대화 기록을 반환
    // → 이 시점부터 대화 기록 보관 책임은 프론트엔드로 넘어감
    res.json({ data });
  } catch (error) {
    console.log(error);
    // 주의: 에러 발생 시 클라이언트에 응답을 보내지 않아
    // 프론트엔드가 응답을 계속 기다리다 타임아웃될 수 있음.
    // 예: res.status(500).json({ error: "레시피 생성 중 오류가 발생했습니다." }) 추가 권장
  }
});

// 유저와의 
// ============================================================
// [POST] /message : 대화를 이어가는 지점 (두 번째 요청부터) 유저와의 채팅
// - 프론트엔드가 지금까지의 messages 배열 전체 + 새 사용자 메시지를 함께 전송
// ============================================================
app.post("/message", async (req, res) => {
  // 지금까지의 대화 기록(messages)과 새로 입력한 메시지(userMessage)를 함께 받음
  const { userMessage, messages } = req.body;

  try {
    // 기존 대화 기록 뒤에 새 사용자 메시지를 이어 붙여 OpenAI에 전달
    // 주의: userMessage는 { role: "user", content: "..." } 형태의 객체여야
    //       messages 배열 형식과 맞음 (프론트엔드 구현 확인 필요)
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [...messages, userMessage],
      temperature: 1,
      max_tokens: 4000,
      top_p: 1,
    });

    // /recipe와 달리 전체 대화 배열이 아니라
    // 새로 생성된 assistant 응답 하나만 반환
    // → 이 라우터는 상태를 저장하지 않음(stateless): 누적 저장은 프론트엔드 몫
    const data = response.choices[0].message;

    res.json({ data });
  } catch (error) {
    console.log(error);
    // 여기도 마찬가지로 에러 응답 처리가 없어 클라이언트가 응답을 못 받을 수 있음
  }
});

// 서버 실행
app.listen(8080, ()=>{
  console.log("서버 ON")
  // chatTest()
})
// console.log("OPENAI_API_KEY:",process.env.OPENAI_API_KEY);