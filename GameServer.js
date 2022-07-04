const { wrapMod } = require("./helpers");
const { nanoid } = require("nanoid");
const axios = require("axios").default;

const COLOR = {
  0: "red",
  1: "green",
  2: "blue",
  3: "yellow",
};

class GameServer {
  serverId;
  serverName;
  serverPassword;
  token;

  players = [];
  curPlayer = 0;
  currentQuestion = 0;
  question;
  currentSetCorrectAnswers = 0;

  constructor(serverName, serverPassword, numberOfPlayers = 4) {
    this.serverId = nanoid();
    this.serverName = serverName;
    this.serverPassword = serverPassword;
    this.numberOfPlayers = numberOfPlayers;
    this.getSessionToken();
  }

  async getSessionToken() {
    const { data } = await axios.get(
      "https://opentdb.com/api_token.php?command=request"
    );
    this.token = data.token;
  }

  async fetchQuiz() {
    try {
      const { data } = await axios.get(
        `https://opentdb.com/api.php?amount=30&category=9&difficulty=medium&difficulty=easy&type=multiple&encode=url3986`
      );

      return data.results.map((element, i) => ({
        id: i + 1,
        question: element.question,
        correct_answer: element.correct_answer,
        answers: [...element.incorrect_answers, element.correct_answer],
      }));
    } catch (err) {
      console.error(err.message);
    }
  }

  init() {
    this.players = [];
    this.curPlayer = 0;
    this.gameRunning = false;
  }

  joinPlayer(player) {
    const playerId = nanoid();

    this.players.push({
      ...player,
      id: playerId,
      removed: false,
      moved: false,
    });
    return playerId;
  }

  isAdmin(playerId) {
    return this.players.length && this.players[0].id === playerId;
  }

  leavePlayer(playerId) {
    if (!this.gameRunning) {
      this.players = this.players.filter((p) => p.id !== playerId);
    } else {
      const player = this.players.find((p) => p.id === playerId);
      player.disconnected = true;
      player.isBot = true;
    }
  }

  start() {
    this.players = this.players.sort(() => Math.random() - 0.5);
    this.players.forEach((player, idx) => {
      player.color = COLOR[idx];
      player.initialPosition = idx * 6;
      player.position = idx * 6;
      this.fetchQuiz().then((res) => {
        player.questions = res;
      });
    });
  }

  startQuestions() {
    this.currentQuestion = 0;
  }

  answerQuestion(answerIndex) {
    this.currentQuestion += 1;
    if (this.question.answers[answerIndex] === this.question.correct_answer)
      this.currentSetCorrectAnswers += 1;
  }

  getQuestion() {
    this.question = this.players[this.curPlayer].questions.pop();
    return {
      player: this.players[this.curPlayer].id,
      question: this.question,
    };
  }

  getSurprise() {
    if (this.currentSetCorrectAnswers === 0)
      return {
        step: 0,
        message: "oops... you did not have any correct answer",
      };

    const surpriseOrNot =
      (Math.floor(Math.random() * 10) & 1) |
      (Math.floor(Math.random() * 10) & 1);

    if (!surpriseOrNot) {
      return {
        step: 0,
        message: "hehe oops... you need to take one step back",
      };
    } else
      return {
        step: 0,
        message: "more luck next time",
      };
  }

  nextPlayer() {
    this.currentSetCorrectAnswers = 0;
    let nxtPlayer = this.curPlayer;

    this.curPlayer = wrapMod(nxtPlayer + 1, this.players.length);
    while (this.players[this.curPlayer].removed) {
      console.log(this.curPlayer);
      this.curPlayer = wrapMod(this.curPlayer + 1, this.players.length);
    }

    this.currentQuestion = 0;
    return this.curPlayer;
  }

  movePlayer(step = this.currentSetCorrectAnswers) {
    const startPosition = this.players[this.curPlayer].position;
    if (!this.players[this.curPlayer].moved && step > 0) {
      this.players[this.curPlayer].moved = true;
    }

    for (let i = 0; i < step; i++) {
      this.players[this.curPlayer].position =
        (this.players[this.curPlayer].position + 1) % 24;

      if (
        this.players[this.curPlayer].moved &&
        this.players[this.curPlayer].position ===
          this.players[this.curPlayer].initialPosition
      ) {
        break;
      }
    }

    const endPosition = this.players[this.curPlayer].position;

    return { startPosition, endPosition, direction: Math.sign(step) };
  }

  removePlayer(index) {
    const removedPlayer = [this.players[index]];
    this.players[index].removed = true;
    return { newPlayers: this.players, removedPlayer };
  }

  onFinish(cb) {
    this.onFinish = cb;
  }

  finishGame() {
    const winner = this.players[this.curPlayer];

    this.init();

    this.onFinish(winner);
  }
}

module.exports = GameServer;
