# Hackathon 

## Teach a machine to teach humans how to spot a lie.

Build a gamified, AI-driven tool that trains users to recognise different flavours of disinformation — loaded language, false dichotomy, manufactured consensus, cherry-picking, whataboutism. Think Duolingo for critical thinking. Points optional, dopamine mandatory.

## Datasets

LIAR dataset

This dataset gives:

short political statements
truthfulness labels
speaker/context/history metadata

That means it can help you train or test a model that classifies statements by truthfulness. It is useful for:

labeling statements
building a truthfulness classifier
creating practice questions
showing context behind claims
FakeNewsNet

This dataset includes:

news articles
social engagement signals
context over time

That means it is useful for:

showing how misinformation spreads
analyzing the post/article plus reaction around it
adding a more realistic “life cycle” of a lie

# Our Approach

🕹️ LEVEL DESIGN (Progression System)
🟢 Level 1: “Spot the Obvious”
Simple fake vs real
Clear examples
Gameplay:
Show headline
Ask: “True or Misleading?”
Skills:
Basic intuition
🟡 Level 2: “Name the Trick”
Introduce manipulation types
Gameplay:
Show content
Options:
loaded language, false dichotomy, manufactured consensus, cherry-picking, whataboutism. Example:
“Either you support this policy or you hate your country”
✔ Correct answer: False Dichotomy
🟠 Level 3: “Explain Yourself”
User must justify answer
Gameplay:
Select tactic + short explanation (or choose reasoning)
AI Role:
Evaluates reasoning (NLP scoring)
Gives feedback:
“You caught the tactic but missed why it's misleading”
🔴 Level 4: “Spot the Subtle Lie”
Real-world content (hard mode)
Gameplay:
Mixed signals (partially true info)
Time pressure
Skills:
Critical thinking
Nuanced judgment
🟣 Level 5: “You vs AI”
AI tries to trick the user
Gameplay:
AI generates persuasive fake content
User must detect manipulation
🔥 This is your wow feature
⚫ Level 6: “Build the Lie”
Reverse psychology learning
Gameplay:
User creates misleading content
AI/other players try to detect it
👉 Best way to learn deeply