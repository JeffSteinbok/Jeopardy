import * as React from "react";
import { JeffpardyCategory } from "./JeffpardyCategory"
import { Logger } from "../../../utilities/Logger";
import { JeffpardyHostController } from "../JeffpardyHostController";
import { JeffpardyClue } from "./JeffpardyClue"
import { Timer } from "./Timer"
import { ICategory, IClue, FinalJeffpardyAnswerDictionary, FinalJeffpardyWagerDictionary } from "../Types";
import { ITeam, TeamDictionary } from "../../../Types";
import { Debug, DebugFlags } from "../../../utilities/Debug";
import { FinalJeffpardySubmissionList } from "./FinalJeffpardySubmissionList";
import { FinalJeffpardyTally } from "./FinalJeffpardyTally";

export enum JeopardyBoardView {
    Board,
    DailyDouble,
    Clue,
    Question,
    Intermission,
    FinalCategory,
    FinalClue,
    FinalTally,
    End
}

export interface IJeffpardyBoardProps {
    jeffpardyHostController: JeffpardyHostController;
    round: number;
    categories: ICategory[];
    controllingTeam: ITeam;
    teams: TeamDictionary;
    finalJeffpardyWagers: FinalJeffpardyWagerDictionary,
    finalJeffpardyAnswers: FinalJeffpardyAnswerDictionary,
    onScoreChange: (team: ITeam, newScore: number) => void
}

export interface IJeffpardyBoardState {
    activeClue: IClue;
    activeCategory: ICategory;
    jeopardyBoardView: JeopardyBoardView;
    timerPercentageRemaining: number;
}

export interface IJeffpardyBoard {
    showClue: (category: ICategory, clue: IClue) => void;
    showQuestion: () => void;
    showBoard: () => void;
    startTimer: () => void;
    stopTimer: () => void;
}

export class JeffpardyBoard extends React.Component<IJeffpardyBoardProps, IJeffpardyBoardState> implements IJeffpardyBoard {

    private contextMenuTarget: any;
    private categories: ICategory = null;
    private timerHandle;
    private timerDurationInSeconds: number;
    private timerRemainingDurationInSeconds: number;
    private dailyDoubleBetTemp: string;

    constructor(props: any) {
        super(props);

        Logger.debug("JeffpardyBoard:constructor", this.props.categories);

        this.timerDurationInSeconds = 5;
        if (Debug.IsFlagSet(DebugFlags.ShortTimers)) {
            this.timerDurationInSeconds = 1;
        }

        // HACK HACK
        let boardView: JeopardyBoardView = JeopardyBoardView.Board;
        if (this.props.round == 2) {
            boardView = JeopardyBoardView.FinalCategory;
            this.props.jeffpardyHostController.startFinalJeffpardy();
        }

        this.state = {
            jeopardyBoardView: boardView,
            activeClue: null,
            activeCategory: null,
            timerPercentageRemaining: 1
        }

        this.props.jeffpardyHostController.setJeffpardyBoard(this);
    }

    public showClue = (category: ICategory, clue: IClue) => {
        if (clue.isDailyDouble && this.state.jeopardyBoardView == JeopardyBoardView.Board) {
            this.setState({
                activeClue: clue,
                activeCategory: category,
                jeopardyBoardView: JeopardyBoardView.DailyDouble
            });
        } else {
            this.setState({
                activeClue: clue,
                activeCategory: category,
                jeopardyBoardView: JeopardyBoardView.Clue
            });
            this.props.jeffpardyHostController.showClue(clue);
        }
    }

    public showQuestion = () => {
        this.stopTimer();

        this.setState({
            jeopardyBoardView: JeopardyBoardView.Question,
        })
    };

    public showBoard = () => {
        this.clearTimer();

        // Are all the clues used?
        let boardEmpty: Boolean = true;
        for (var i = 0; i < this.props.categories.length; i++) {
            if (!this.props.categories[i].isAsked) {
                boardEmpty = false;
            }
        }

        let newBoardView: JeopardyBoardView = JeopardyBoardView.Board;
        if (boardEmpty) {
            if (this.props.round == 1) {
                newBoardView = JeopardyBoardView.Intermission;
            }
            if (this.props.round == 1) {
                this.props.jeffpardyHostController.startFinalJeffpardy();
                newBoardView = JeopardyBoardView.FinalCategory;
            }
            if (this.props.round == 2) { newBoardView = JeopardyBoardView.End }
        }

        this.setState({
            activeClue: null,
            activeCategory: null,
            jeopardyBoardView: newBoardView
        })
    };

    public startNewRound = () => {
        this.props.jeffpardyHostController.startNewRound();
        this.setState({
            jeopardyBoardView: JeopardyBoardView.Board
        })
    }

    public showFinalJeffpardyClue = () => {
        this.props.jeffpardyHostController.showFinalJeffpardyClue();
        this.setState({
            jeopardyBoardView: JeopardyBoardView.FinalClue
        })
        this.timerDurationInSeconds = 30;
        this.startTimer();
    }

    public validateAndSubmitDailyDoubleBet = (maxBet: number) => {
        let ddBet = Number.parseInt(this.dailyDoubleBetTemp, 10);
        if (isNaN(ddBet) || ddBet > maxBet || ddBet < 0) {
            alert("Please enter a wager between 0 and " + maxBet + ".");
            return;
        } else {
            this.props.jeffpardyHostController.setDailyDoubleWager(ddBet);
            this.showClue(this.state.activeCategory, this.state.activeClue);
        }
    }

    public startTimer = () => {
        this.timerRemainingDurationInSeconds = this.timerDurationInSeconds;
        this.timerHandle = setTimeout(this.onTimerFire, 250);
    }

    public stopTimer = () => {
        clearTimeout(this.timerHandle);
    }

    public clearTimer = () => {
        this.setState({
            timerPercentageRemaining: 1
        })
    }

    public onTimerFire = () => {

        this.timerRemainingDurationInSeconds = this.timerRemainingDurationInSeconds - 0.25;
        let percentRemaing = (this.timerRemainingDurationInSeconds) / this.timerDurationInSeconds;
        if (percentRemaing != this.state.timerPercentageRemaining) {
            this.setState({
                timerPercentageRemaining: percentRemaing
            })
        }
        if (percentRemaing > 0) {
            this.timerHandle = setTimeout(this.onTimerFire, 250);
        } else {
            // Time's up!
            if (this.state.jeopardyBoardView == JeopardyBoardView.FinalClue) {
                this.props.jeffpardyHostController.endFinalJeffpardy();
                this.setState({
                    jeopardyBoardView: JeopardyBoardView.FinalTally
                });
            } else {
                this.props.jeffpardyHostController.buzzerTimeout();
            }
        }
    }

    onTallyCompleted = () => {
        Logger.debug("JeffpardyBoard:onTallyCompleted");
        this.setState({
            jeopardyBoardView: JeopardyBoardView.End
        })
    }

    public render() {

        Logger.debug("JeffpardyBoard:render", this.props.categories);

        let boardGridElements: JSX.Element[] = [];
        let dailyDoubleMaxBet: number;

        if (this.props.categories && this.state.activeClue == null) {
            Logger.debug("Drawing Categories!", this.props.categories);
            // Generate the grid of DIVs.  Doesn't work super-well in the below because they are not
            // nested.
            var keyCounter: number = 0;
            for (var i: number = 0; i < this.props.categories.length; i++) {
                let category: ICategory = this.props.categories[i];
                boardGridElements.push(<JeffpardyCategory
                    key={ keyCounter++ }
                    style={ { gridRow: 1, gridColumn: i + 1 } }
                    category={ category }
                    jeffpardyBoard={ this } />);

                for (var j: number = 0; j < category.clues.length; j++) {
                    let clue: IClue = category.clues[j];
                    boardGridElements.push(<JeffpardyClue
                        key={ keyCounter++ }
                        style={ { gridRow: j + 2, gridColumn: i + 1 } }
                        jeffpardyBoard={ this }
                        category={ category }
                        clue={ clue } />);
                }
            }
        }


        if (this.state.activeClue != null &&
            this.state.activeClue.isDailyDouble) {

            if (this.props.controllingTeam != null) {
                let currentTeamScore: number = this.props.controllingTeam.score;
                dailyDoubleMaxBet = Math.max(currentTeamScore, 2 * (500 * (this.props.round + 1)));
            } else {
                // Controlling team not here, but we're at the DD, so just to be safe, set to 0.
                dailyDoubleMaxBet = 0;
            }
        }

        return (
            <div id="jeffpardyBoardFrame" >
                <div id="jeffpardyBoardInnerFrame">
                    <div id="jeffpardyBoard">
                        { this.state.jeopardyBoardView == JeopardyBoardView.Board &&
                            <div className="jeffpardyBoardClues">
                                { boardGridElements }
                            </div>
                        }
                        { (this.state.jeopardyBoardView == JeopardyBoardView.Clue || this.state.jeopardyBoardView == JeopardyBoardView.Question) &&
                            <div className="jeffpardyActiveClue">
                                <div className="header">{ this.state.activeCategory.title } for { this.state.activeClue.value }</div>
                                <div className="clue">{ this.state.activeClue.clue }</div>
                                { this.state.jeopardyBoardView == JeopardyBoardView.Question &&
                                    <div className="question">{ this.state.activeClue.question }</div>
                                }
                                <Timer percentageRemaining={ this.state.timerPercentageRemaining }></Timer>
                            </div>
                        }
                        { (this.state.jeopardyBoardView == JeopardyBoardView.DailyDouble) &&
                            <div className="jeffpardyActiveClue">
                                <div className="header">{ this.state.activeCategory.title } for { this.state.activeClue.value }</div>
                                <div className="dailyDouble">
                                    <div>The answer is a....</div>
                                    <div className="title">Daily Double!</div>
                                    <div className="wager">
                                        Wager amount:<br />
                                        <input
                                            type="number"
                                            min={ 0 }
                                            max={ dailyDoubleMaxBet }
                                            step={ 100 }
                                            onChange={ e => { this.dailyDoubleBetTemp = e.target.value } } />
                                    </div>
                                    <div><i>Enter a value up to { dailyDoubleMaxBet }.</i></div>
                                    <p />
                                    <button onClick={ () => { this.validateAndSubmitDailyDoubleBet(dailyDoubleMaxBet) } }>Submit</button>
                                </div>
                            </div>
                        }
                        { this.state.jeopardyBoardView == JeopardyBoardView.Intermission &&
                            <div className="jeffpardyIntermission">
                                Ready for... <br />
                                <div className="title">Super Jeffpardy!?</div>
                                Harder clues....Higher points
                                <p />
                                <button onClick={ this.startNewRound }>Start</button>
                            </div>
                        }
                        { (this.state.jeopardyBoardView == JeopardyBoardView.FinalCategory ||
                            this.state.jeopardyBoardView == JeopardyBoardView.FinalClue ||
                            this.state.jeopardyBoardView == JeopardyBoardView.FinalTally ||
                            this.state.jeopardyBoardView == JeopardyBoardView.End) &&
                            <div className="jeffpardyFinal">
                                The category for Final Jeffpardy is:<br />
                                <div className="category">{ this.props.categories[0].title }</div>

                                { this.state.jeopardyBoardView == JeopardyBoardView.FinalCategory &&
                                    <div className="jeffpardyFinalCategory">
                                        <FinalJeffpardySubmissionList
                                            teams={ this.props.teams }
                                            submissions={ this.props.finalJeffpardyWagers }
                                            waitingText="Waiting for Wager."
                                            receivedText="Wager Locked" />

                                        <button onClick={ this.showFinalJeffpardyClue }>Show Clue</button>
                                    </div>
                                }
                                { this.state.jeopardyBoardView == JeopardyBoardView.FinalClue &&
                                    <div className="jeffpardyFinalClue">
                                        <FinalJeffpardySubmissionList
                                            teams={ this.props.teams }
                                            submissions={ this.props.finalJeffpardyAnswers }
                                            waitingText="Waiting for Answer"
                                            receivedText="Answer Locked" />
                                        <Timer percentageRemaining={ this.state.timerPercentageRemaining }></Timer>
                                    </div>
                                }
                                { (this.state.jeopardyBoardView == JeopardyBoardView.FinalTally ||
                                    this.state.jeopardyBoardView == JeopardyBoardView.End) &&
                                    <div className="jeffpardyFinalTally">
                                        <FinalJeffpardyTally
                                            teams={ this.props.teams }
                                            wagers={ this.props.finalJeffpardyWagers }
                                            answers={ this.props.finalJeffpardyAnswers }
                                            onScoreChange={ this.props.onScoreChange }
                                            onTallyCompleted={ this.onTallyCompleted }
                                        />

                                        { this.state.jeopardyBoardView == JeopardyBoardView.End &&
                                            <div className="jeffpardyEnd">
                                                Thank you for playing<br />
                                                <div className="title">Jeffpardy!</div>
                                                <p />
                                                Refresh your browser to start a new game.
                                            </div>
                                        }
                                    </div>
                                }
                            </div>
                        }
                    </div>
                </div>
            </div >
        );
    }
}
