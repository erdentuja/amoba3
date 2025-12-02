function handleTimerExpiry() {
    // Check if it's the AI's turn to move
    if (isAITurn) {
        // Automatically make a move for the AI
        const aiMove = calculateAIMove();
        makeMove(aiMove);
        console.log('AI made a move:', aiMove);
    } else {
        // Handle other cases
        console.log('Timer expired, but it is not AI turn.');
    }
}