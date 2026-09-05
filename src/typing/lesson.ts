export interface Lesson {
  id: string
  title: string
  text: string
}

export const FIRST_LESSON: Lesson = {
  id: 'small-steps',
  title: 'Small steps, smooth rhythm',
  text: 'quick foxes jump over lazy dogs, while bright wizards pack five quirky boxes. calm typists breathe, place each finger gently, and watch small mistakes become smooth rhythm. every careful word builds speed without rushing, until the keyboard feels familiar and your hands know exactly where to go next with confidence.',
}

export const LESSON_WORDS = FIRST_LESSON.text.split(' ')

